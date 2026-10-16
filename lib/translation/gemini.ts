import { callGeminiWithFallback, type GeminiResult } from "@/lib/gemini/client";

const LANGUAGE_NAMES: Record<string, string> = {
  ZH: "Traditional Chinese (繁體中文)",
  EN: "English",
  JA: "Japanese",
};

export type { GeminiResult };

// Translation must feel instant. gemini-3.6-flash (this module's shared
// client default) does substantial internal "thinking" even on trivial
// prompts — measured at 25-38s for a one-sentence translation. The lighter
// gemini-3.1-flash-lite model returns the same kind of translation in
// ~1s, which is what a live selection-translate UX needs.
const FAST_MODEL = "gemini-3.1-flash-lite";

// Used only when FAST_MODEL's transient 5xx (503 etc.) retries are all
// exhausted — overload is usually per-model, so the heavier model often still
// answers. It is slower (25-38s measured) and its free-tier daily quota
// (~20 req/day) is scarce and shared with reflection chat once that returns
// to this model, so callGeminiWithFallback makes just one time-boxed attempt
// and never falls back for 429/auth/network errors.
const FALLBACK_MODEL = "gemini-3.6-flash";

/**
 * Translation-specific prompt built on top of the shared lib/gemini/client
 * call. Kept as its own function (rather than calling callGemini directly
 * from translate-text.ts) so translate-text.ts's provider interface stays
 * decoupled from prompt construction, matching the translateWithDeepL
 * shape it replaced.
 */
export async function translateWithGemini({
  text,
  targetLang,
  apiKey,
}: {
  text: string;
  targetLang: string;
  apiKey: string;
}): Promise<GeminiResult> {
  const languageName = LANGUAGE_NAMES[targetLang] ?? targetLang;
  const prompt = `Translate the following text into ${languageName}. Output only the translated text — no explanation, no quotation marks, no additional commentary.\n\n${text}`;

  return callGeminiWithFallback({
    prompt,
    apiKey,
    primaryModel: FAST_MODEL,
    fallbackModel: FALLBACK_MODEL,
  });
}
