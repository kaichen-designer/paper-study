const DEFAULT_MODEL = "gemini-3.6-flash";

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export type GeminiResult = { ok: true; text: string } | { ok: false; message: string };

// HTTP statuses that indicate a transient, retry-worthy failure (rate limiting or a
// server-side hiccup) as opposed to a request/auth problem that a retry can't fix.
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;
const JITTER_MS = 200;

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
 * Transient failures (HTTP 429/500/502/503/504) are retried internally with
 * exponential backoff + jitter, up to MAX_RETRIES times, before giving up
 * and returning the same { ok: false, message } shape as a non-retried
 * failure — callers don't need to know a retry happened. Non-retryable
 * errors (e.g. 401/403) and network exceptions fail immediately.
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
        const failure: GeminiResult = {
          ok: false,
          message: `Gemini 回應錯誤(HTTP ${response.status})${detail ? `:${detail}` : ""}`,
        };

        if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === MAX_RETRIES) {
          return failure;
        }

        await retryDeps.sleep(BASE_DELAY_MS * 2 ** attempt + Math.random() * JITTER_MS);
        continue;
      }

      const body = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!text) {
        return { ok: false, message: "Gemini 回應中沒有內容。" };
      }

      return { ok: true, text };
    } catch (err) {
      return {
        ok: false,
        message: `無法連線至 Gemini:${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Unreachable: the loop always returns on its final iteration (attempt === MAX_RETRIES).
  throw new Error("callGemini: retry loop exited without a result");
}
