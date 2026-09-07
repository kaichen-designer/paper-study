import type { SupabaseClient } from "@supabase/supabase-js";
import { hashText } from "./hash";
import { getCachedTranslation, saveTranslation } from "./cache";
import { translateWithGemini } from "./gemini";

export type TranslateTextResult =
  | { ok: true; text: string; cached: boolean }
  | { ok: false; message: string };

type ProviderResult = { ok: true; text: string } | { ok: false; message: string };

type Deps = {
  getCached: typeof getCachedTranslation;
  saveCache: typeof saveTranslation;
  provider: (args: {
    text: string;
    targetLang: string;
    apiKey: string;
  }) => Promise<ProviderResult>;
};

const defaultDeps: Deps = {
  getCached: getCachedTranslation,
  saveCache: saveTranslation,
  provider: translateWithGemini,
};

/**
 * Orchestrates a single translation request: cache lookup first, provider
 * call + cache write only on a miss. `deps` defaults to the real
 * Supabase/Gemini implementations but can be overridden in tests (or
 * swapped for lib/translation/deepl.ts's translateWithDeepL, kept around
 * as an alternative provider with the same { ok, text|message } shape).
 */
export async function translateText({
  supabase,
  text,
  sourceLang,
  targetLang,
  apiKey,
  paperId,
  deps = defaultDeps,
}: {
  supabase: SupabaseClient;
  text: string;
  sourceLang: string;
  targetLang: string;
  apiKey: string;
  paperId?: string;
  deps?: Deps;
}): Promise<TranslateTextResult> {
  const textHash = hashText(text);

  const cached = await deps.getCached(supabase, { textHash, sourceLang, targetLang });
  if (cached) {
    return { ok: true, text: cached, cached: true };
  }

  const result = await deps.provider({ text, targetLang, apiKey });
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  await deps.saveCache(supabase, {
    textHash,
    sourceLang,
    targetLang,
    translatedText: result.text,
    paperId,
  });

  return { ok: true, text: result.text, cached: false };
}
