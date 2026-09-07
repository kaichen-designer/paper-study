import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "translation_cache";

/**
 * Looks up a cached translation by content hash + language pair (see the
 * unique constraint on translation_cache in schema.sql). Returns null on a
 * miss rather than throwing, so a cache miss is just "call DeepL", not an
 * error path.
 */
export async function getCachedTranslation(
  supabase: SupabaseClient,
  { textHash, sourceLang, targetLang }: { textHash: string; sourceLang: string; targetLang: string }
): Promise<string | null> {
  const { data } = await supabase
    .from(TABLE)
    .select("translated_text")
    .eq("source_text_hash", textHash)
    .eq("source_lang", sourceLang)
    .eq("target_lang", targetLang)
    .maybeSingle();

  return (data as { translated_text: string } | null)?.translated_text ?? null;
}

/**
 * Stores a translation result. Upserts on the (hash, source_lang,
 * target_lang) unique key so re-saving the same translation is idempotent
 * rather than erroring on a duplicate-key conflict.
 */
export async function saveTranslation(
  supabase: SupabaseClient,
  {
    textHash,
    sourceLang,
    targetLang,
    translatedText,
    paperId,
  }: {
    textHash: string;
    sourceLang: string;
    targetLang: string;
    translatedText: string;
    paperId?: string;
  }
): Promise<void> {
  await supabase.from(TABLE).upsert(
    {
      source_text_hash: textHash,
      source_lang: sourceLang,
      target_lang: targetLang,
      translated_text: translatedText,
      paper_id: paperId ?? null,
    },
    { onConflict: "source_text_hash,source_lang,target_lang" }
  );
}
