import type { SupabaseClient } from "@supabase/supabase-js";
import type { Paper } from "./queries";

const PAPERS_BUCKET = "papers";
const PAPERS_TABLE = "papers";
const SIGNED_URL_TTL_SECONDS = 60 * 5;

/**
 * Looks up a single paper by id. Relies on the `papers_select_own` RLS
 * policy (schema.sql) to return null/no-row rather than another user's
 * paper when the id belongs to someone else — this function does not add
 * its own user_id filter, matching the pattern in lib/papers/queries.ts.
 */
export async function getPaperById(supabase: SupabaseClient, id: string): Promise<Paper | null> {
  const { data, error } = await supabase.from(PAPERS_TABLE).select("*").eq("id", id).single();

  if (error || !data) {
    return null;
  }

  return data as Paper;
}

/**
 * Requests a short-lived signed URL for a paper's PDF in Storage. The
 * bucket is private, so a signed URL (not a public URL) is required to
 * render the file client-side.
 */
export async function getPaperSignedUrl(
  supabase: SupabaseClient,
  storagePath: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PAPERS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(`Failed to create signed URL for ${storagePath}: ${error?.message}`);
  }

  return data.signedUrl;
}
