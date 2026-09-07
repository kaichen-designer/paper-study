import { callGemini, type GeminiResult } from "@/lib/gemini/client";

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

  return callGemini({ prompt, apiKey, model: FAST_MODEL });
}
