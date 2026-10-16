const DEFAULT_MODEL = "gemini-3.6-flash";

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export type GeminiResult = { ok: true; text: string } | { ok: false; message: string };

// HTTP statuses that indicate a transient, retry-worthy failure (a server-side
// hiccup) as opposed to a request/auth problem that a retry can't fix.
//
// 429 is deliberately excluded even though it's nominally "rate limiting":
// Gemini's free tier returns 429 both for short-lived per-minute throttling
// AND for the per-day-per-model quota being exhausted (same status code,
// distinguished only by the error body's quotaId). Retrying the latter
// wastes 2 extra calls of an already-scarce daily allowance (as low as
// 20 requests/day/model) for no chance of success, so 429 is treated as
// non-retryable here — a single wasted retry is worse than a fast failure.
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);
// Google's overload episodes (503 "high demand") typically last tens of
// seconds, so the backoff has to cover that window: 1s + 2s + 4s + 8s = 15s
// of waiting across 4 retries (plus up to JITTER_MS per retry).
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;
const JITTER_MS = 500;

// User-facing messages. The raw Gemini response body is only written to the
// server log (console.error), never returned to the caller, so JSON error
// payloads don't leak into the UI.
const NETWORK_ERROR_MESSAGE = "無法連線至 Gemini,請檢查網路連線後再試一次。";
const EMPTY_RESPONSE_MESSAGE = "Gemini 回應中沒有內容。";

function friendlyStatusMessage(status: number): string {
  if (RETRYABLE_STATUS_CODES.has(status)) {
    return `Gemini 服務目前較為繁忙,請稍後再試。(HTTP ${status})`;
  }
  if (status === 429) {
    return `Gemini 的使用額度或請求頻率已達上限,請稍後再試。(HTTP ${status})`;
  }
  if (status === 401 || status === 403) {
    return `Gemini API 金鑰無效或沒有權限,請檢查伺服器設定。(HTTP ${status})`;
  }
  return `Gemini 回應錯誤,請稍後再試。(HTTP ${status})`;
}

type RetryDeps = { sleep: (ms: number) => Promise<void> };

const defaultRetryDeps: RetryDeps = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Shared low-level Gemini call, used by both lib/translation/gemini.ts and
 * lib/reflection/generate-reply.ts. The API key is passed in explicitly by
 * the caller (never read from process.env here) and sent via the
 * `x-goog-api-key` header rather than a `?key=` query param, so it never
 * ends up in URLs that get logged (server access logs, proxies).
 *
 * `model` defaults to gemini-3.6-flash (used by reflection chat, where a
 * few extra seconds for a more thorough reply is acceptable). Callers with
 * tighter latency needs (e.g. translation, which must feel instant) should
 * pass a lighter model such as gemini-3.1-flash-lite — measured at ~1s vs
 * 25-38s for gemini-3.6-flash on the same trivial prompt, because the
 * larger model does substantial internal "thinking" by default that a
 * flash-lite model does not.
 *
 * Never throws: every failure path (bad status, network error, empty
 * response) resolves to an { ok: false, message } result.
 *
 * Transient failures (HTTP 500/502/503/504) are retried internally with
 * exponential backoff + jitter, up to MAX_RETRIES (4) times — about 15s of
 * cumulative waiting — before giving up and returning the same
 * { ok: false, message } shape as a non-retried failure — callers don't need
 * to know a retry happened. Non-retryable errors (e.g. 401/403/429) and
 * network exceptions fail immediately. Every failure `message` is a
 * user-presentable Traditional Chinese sentence; the raw response body is
 * logged server-side only.
 * `retryDeps` is an internal test seam (default: real setTimeout-based
 * sleep) — production callers never need to pass it.
 */
export async function callGemini({
  prompt,
  apiKey,
  model = DEFAULT_MODEL,
  retryDeps = defaultRetryDeps,
}: {
  prompt: string;
  apiKey: string;
  model?: string;
  retryDeps?: RetryDeps;
}): Promise<GeminiResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(endpointFor(model), {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");

        if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === MAX_RETRIES) {
          console.error(
            `[callGemini] giving up after ${attempt + 1} attempt(s): HTTP ${response.status}`,
            detail
          );
          return { ok: false, message: friendlyStatusMessage(response.status) };
        }

        await retryDeps.sleep(BASE_DELAY_MS * 2 ** attempt + Math.random() * JITTER_MS);
        continue;
      }

      const body = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!text) {
        return { ok: false, message: EMPTY_RESPONSE_MESSAGE };
      }

      return { ok: true, text };
    } catch (err) {
      console.error(
        `[callGemini] network exception on attempt ${attempt + 1}:`,
        err instanceof Error ? err.message : String(err)
      );
      return { ok: false, message: NETWORK_ERROR_MESSAGE };
    }
  }

  // Unreachable: the loop always returns on its final iteration (attempt === MAX_RETRIES).
  throw new Error("callGemini: retry loop exited without a result");
}
