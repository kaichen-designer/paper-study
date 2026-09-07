const DEEPL_FREE_ENDPOINT = "https://api-free.deepl.com/v2/translate";

export type DeepLResult = { ok: true; text: string } | { ok: false; message: string };

/**
 * Calls DeepL server-side. The API key is passed in explicitly by the
 * caller (the /api/translate route reads it from a server-only env var)
 * rather than read from process.env here, so this function never needs to
 * know whether it's running in a context where the key is even available —
 * it just fails to authenticate, same as any other bad key.
 *
 * Never throws: every failure path (bad status, network error) resolves to
 * an { ok: false, message } result so the caller can surface it to the user
 * instead of an unhandled rejection.
 */
export async function translateWithDeepL({
  text,
  targetLang,
  apiKey,
}: {
  text: string;
  targetLang: string;
  apiKey: string;
}): Promise<DeepLResult> {
  try {
    const response = await fetch(DEEPL_FREE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: [text], target_lang: targetLang }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        message: `DeepL 回應錯誤(HTTP ${response.status})${detail ? `:${detail}` : ""}`,
      };
    }

    const body = (await response.json()) as { translations: { text: string }[] };
    const translated = body.translations[0]?.text;

    if (!translated) {
      return { ok: false, message: "DeepL 回應中沒有翻譯結果。" };
    }

    return { ok: true, text: translated };
  } catch (err) {
    return {
      ok: false,
      message: `無法連線至 DeepL:${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
