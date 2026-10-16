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

// `now` feeds callGeminiWithFallback's time budget; tests inject a fake clock.
type RetryDeps = { sleep: (ms: number) => Promise<void>; now?: () => number };

const defaultRetryDeps: RetryDeps = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// Model fallback (callGeminiWithFallback only). The route that calls it
// declares maxDuration = 60s; the budget leaves ~5s for the cache write and
// response. The fallback model (gemini-3.6-flash) has been measured at
// 25-38s for a one-sentence prompt, so its request is capped at 30s and
// skipped entirely when less than 8s of budget remains.
const OVERALL_BUDGET_MS = 55000;
const FALLBACK_MAX_TIMEOUT_MS = 30000;
const FALLBACK_MIN_TIMEOUT_MS = 8000;

// Internal result of one model's full retry run. `transientExhausted` is true
// only when the final failure was a retryable 5xx after all retries were
// spent — the sole condition that justifies trying a different model.
type AttemptResult =
  | { ok: true; text: string }
  | { ok: false; message: string; transientExhausted: boolean; status?: number };

async function attemptModel({
  prompt,
  apiKey,
  model,
  maxRetries,
  retryDeps,
  timeoutMs,
}: {
  prompt: string;
  apiKey: string;
  model: string;
  maxRetries: number;
  retryDeps: RetryDeps;
  timeoutMs?: number;
}): Promise<AttemptResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpointFor(model), {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        ...(timeoutMs !== undefined && { signal: AbortSignal.timeout(timeoutMs) }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const transient = RETRYABLE_STATUS_CODES.has(response.status);

        if (!transient || attempt === maxRetries) {
          console.error(
            `[callGemini] giving up on ${model} after ${attempt + 1} attempt(s): HTTP ${response.status}`,
            detail
          );
          return {
            ok: false,
            message: friendlyStatusMessage(response.status),
            transientExhausted: transient,
            status: response.status,
          };
        }

        await retryDeps.sleep(BASE_DELAY_MS * 2 ** attempt + Math.random() * JITTER_MS);
        continue;
      }

      const body = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!text) {
        return { ok: false, message: EMPTY_RESPONSE_MESSAGE, transientExhausted: false };
      }

      return { ok: true, text };
    } catch (err) {
      console.error(
        `[callGemini] network exception on ${model} attempt ${attempt + 1}:`,
        err instanceof Error ? err.message : String(err)
      );
      return { ok: false, message: NETWORK_ERROR_MESSAGE, transientExhausted: false };
    }
  }

  // Unreachable: the loop always returns on its final iteration (attempt === maxRetries).
  throw new Error("callGemini: retry loop exited without a result");
}

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
  const result = await attemptModel({
    prompt,
    apiKey,
    model,
    maxRetries: MAX_RETRIES,
    retryDeps,
  });

  // Rebuild the object so attemptModel's internal fields never reach callers.
  return result.ok ? { ok: true, text: result.text } : { ok: false, message: result.message };
}

/**
 * Like callGemini on `primaryModel`, but when the primary's transient 5xx
 * (500/502/503/504) retries are all exhausted, makes ONE attempt on
 * `fallbackModel` (no retries, no backoff). Overload (503) is usually a
 * per-model capacity problem, so another model often still answers.
 *
 * Deliberately NOT a fallback for 429 (quota), 401/403, other 4xx, network
 * exceptions or empty responses: switching models can't fix those, and the
 * fallback model's free-tier daily quota is scarce (~20 req/day) and shared
 * with reflection chat.
 *
 * Time is bounded so a route with maxDuration = 60s isn't cut off: the whole
 * call has a 55s budget, the fallback request gets an abort timeout of
 * min(30s, remaining budget), and the fallback is skipped when under 8s
 * remain. If the fallback fails for any reason the PRIMARY model's friendly
 * failure message is returned (the user never asked for, and shouldn't see
 * errors from, the fallback model); the details go to the server log only.
 *
 * Never throws; same GeminiResult shape as callGemini.
 */
export async function callGeminiWithFallback({
  prompt,
  apiKey,
  primaryModel,
  fallbackModel,
  retryDeps = defaultRetryDeps,
}: {
  prompt: string;
  apiKey: string;
  primaryModel: string;
  fallbackModel: string;
  retryDeps?: RetryDeps;
}): Promise<GeminiResult> {
  const now = retryDeps.now ?? Date.now;
  const startedAt = now();

  const primary = await attemptModel({
    prompt,
    apiKey,
    model: primaryModel,
    maxRetries: MAX_RETRIES,
    retryDeps,
  });
  if (primary.ok) return { ok: true, text: primary.text };

  const primaryFailure: GeminiResult = { ok: false, message: primary.message };
  if (!primary.transientExhausted) return primaryFailure;

  const remainingMs = OVERALL_BUDGET_MS - (now() - startedAt);
  const timeoutMs = Math.min(FALLBACK_MAX_TIMEOUT_MS, remainingMs);
  if (timeoutMs < FALLBACK_MIN_TIMEOUT_MS) {
    console.warn(
      `[callGemini] skipping fallback to ${fallbackModel} after ${primaryModel} failed with HTTP ${primary.status}: only ${remainingMs}ms of budget left`
    );
    return primaryFailure;
  }

  console.warn(
    `[callGemini] primary model ${primaryModel} exhausted retries (HTTP ${primary.status}), falling back to ${fallbackModel}`
  );
  const fallback = await attemptModel({
    prompt,
    apiKey,
    model: fallbackModel,
    maxRetries: 0,
    retryDeps,
    timeoutMs,
  });

  if (fallback.ok) {
    console.warn(
      `[callGemini] fallback model ${fallbackModel} succeeded after primary model ${primaryModel} failed`
    );
    return { ok: true, text: fallback.text };
  }

  console.error(
    `[callGemini] fallback model ${fallbackModel} failed after primary model ${primaryModel} failed: ${fallback.message}`
  );
  return primaryFailure;
}
