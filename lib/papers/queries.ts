import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Free-form paper metadata (e.g. page count, authors). Kept as a minimal
 * local type rather than importing from lib/papers/upload.ts, which a
 * parallel task owns and may not exist yet.
 */
export type PaperMetadata = Record<string, unknown>;

export type Paper = {
  id: string;
  user_id: string;
  title: string;
  storage_path: string;
  uploaded_at: string;
  metadata: PaperMetadata;
  reached_last_page: boolean;
  finished_reading: boolean;
  finished_at: string | null;
  imported_to_detabase: boolean;
  reading_stage: "up_next" | "reading" | "finished";
  deleted_at: string | null;
};

export type InsertPaperInput = {
  title: string;
  storagePath: string;
  metadata?: PaperMetadata;
};

/**
 * Lists the signed-in user's papers, newest first.
 *
 * Access-scoping note (Scoundrel lens): this function intentionally takes
 * only `supabase` — no `userId`/`filter` parameter exists for a caller to
 * inject, so there is no way to ask it for someone else's papers. Row
 * visibility is enforced twice: this query has no `.eq('user_id', ...)`
 * of its own, and the `papers_select_own` RLS policy in schema.sql
 * restricts what Postgres actually returns to `auth.uid() = user_id`
 * regardless of what this function does or doesn't filter by.
 */
export async function listPapers(supabase: SupabaseClient): Promise<Paper[]> {
  const { data, error } = await supabase
    .from("papers")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list papers: ${error.message}`);
  }

  return (data ?? []) as Paper[];
}

/**
 * Inserts a paper row owned by the signed-in user.
 *
 * Access-scoping note (Scoundrel lens): `InsertPaperInput` deliberately has
 * no `user_id`/`userId` field, so the safe way to call this (the only way
 * the types allow) is also the secure way (Lazy Developer lens) — a caller
 * cannot pass another user's id even by accident. `user_id` is derived
 * exclusively from `supabase.auth.getUser()`, i.e. whichever session this
 * particular client instance is authenticated as, so two different
 * authenticated clients can never produce a cross-user insert. The
 * `papers_insert_own` RLS policy in schema.sql independently re-checks
 * `auth.uid() = user_id` server-side as a second layer, in case this
 * function is ever bypassed or misused. Missing/failed auth throws rather
 * than silently inserting a null/undefined user_id.
 *
 * This same pattern (derive user_id from auth.getUser(), never accept it
 * as a parameter, let RLS re-check server-side) is what the future notes
 * CRUD query layer should follow.
 */
export async function insertPaper(
  supabase: SupabaseClient,
  { title, storagePath, metadata = {} }: InsertPaperInput
): Promise<Paper> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Cannot insert a paper: no authenticated user.");
  }

  const { data, error } = await supabase
    .from("papers")
    .insert({
      user_id: user.id,
      title,
      storage_path: storagePath,
      metadata,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert paper: ${error.message}`);
  }

  return data as Paper;
}
