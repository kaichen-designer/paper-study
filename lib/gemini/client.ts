const DEFAULT_MODEL = "gemini-3.6-flash";

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export type GeminiResult = { ok: true; text: string } | { ok: false; message: string };

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
 */
export async function callGemini({
  prompt,
  apiKey,
  model = DEFAULT_MODEL,
}: {
  prompt: string;
  apiKey: string;
  model?: string;
}): Promise<GeminiResult> {
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
      return {
        ok: false,
        message: `Gemini 回應錯誤(HTTP ${response.status})${detail ? `:${detail}` : ""}`,
      };
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
