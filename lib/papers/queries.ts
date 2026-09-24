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
    .is("deleted_at", null)
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

/**
 * Renames a paper.
 *
 * A title of only whitespace is rejected rather than stored: the library
 * would render an unlabelled, unidentifiable card, and the upload flow
 * guarantees a non-empty title, so nothing should be able to produce one.
 *
 * Access-scoping note: no `userId` parameter; the `papers_update_own` RLS
 * policy scopes the row. `.select().single()` makes a zero-row match an
 * error rather than a silent no-op.
 */
export async function renamePaper(
  supabase: SupabaseClient,
  paperId: string,
  title: string
): Promise<Paper> {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new Error("Cannot rename a paper to an empty title.");
  }

  const { data, error } = await supabase
    .from("papers")
    .update({ title: trimmed })
    .eq("id", paperId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to rename paper: ${error.message}`);
  }

  return data as Paper;
}

/**
 * Removes a paper from the library without destroying it.
 *
 * A timestamp rather than a boolean: it answers both "is this removed"
 * and "when", which is what the trash orders by, and leaves room for a
 * retention policy without another schema change.
 */
export async function softDeletePaper(supabase: SupabaseClient, paperId: string): Promise<void> {
  const { error } = await supabase
    .from("papers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", paperId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to remove paper: ${error.message}`);
  }
}

/** Returns a removed paper to the library, under the stage it had before. */
export async function restorePaper(supabase: SupabaseClient, paperId: string): Promise<void> {
  const { error } = await supabase
    .from("papers")
    .update({ deleted_at: null })
    .eq("id", paperId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to restore paper: ${error.message}`);
  }
}

/** Lists removed papers for the trash view, most recently removed first. */
export async function listDeletedPapers(supabase: SupabaseClient): Promise<Paper[]> {
  const { data, error } = await supabase
    .from("papers")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list removed papers: ${error.message}`);
  }

  return (data ?? []) as Paper[];
}

/**
 * Permanently deletes a paper, its notes, annotations and reflection
 * messages (by `on delete cascade`), and its stored PDF.
 *
 * Order matters and is deliberate: the row goes first, then the file on
 * a best-effort basis. Doing it the other way round risks leaving a row
 * whose file is gone — a paper in the library that cannot be opened.
 * This way the worst case is an orphaned file: wasted space that shows
 * up nowhere and can be swept later. Auditable waste beats broken state.
 *
 * Access-scoping note: no `userId` parameter; the `papers_delete_own` RLS
 * policy scopes the row. `.select().single()` makes a zero-row match an
 * error rather than a silent no-op.
 */
export async function purgePaper(
  supabase: SupabaseClient,
  paper: Pick<Paper, "id" | "storage_path">
): Promise<void> {
  const { error } = await supabase
    .from("papers")
    .delete()
    .eq("id", paper.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to delete paper: ${error.message}`);
  }

  // Best effort: a failure here leaves an orphaned file, which is
  // preferable to reporting a failure for a deletion that did happen.
  await supabase.storage.from("papers").remove([paper.storage_path]);
}
