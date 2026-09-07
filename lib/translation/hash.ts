import { createHash } from "node:crypto";

/**
 * Deterministic content hash used as the translation cache key
 * (see translation_cache.source_text_hash in schema.sql).
 */
export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
