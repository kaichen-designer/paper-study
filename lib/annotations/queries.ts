import type { SupabaseClient } from "@supabase/supabase-js";
import type { Point } from "./stroke-geometry";

// `opacity` is set for highlighter strokes (translucent ink, so it doesn't
// fully obscure the text underneath) — absent (full opacity) for ordinary
// pen strokes, including ones saved before the highlighter tool existed.
export type Stroke = { points: Point[]; color?: string; width?: number; opacity?: number };

export type CreateStrokeNoteInput = {
  paperId: string;
  pageNumber: number;
  strokes: Stroke[];
};

/**
 * Creates a stroke-based (hand-drawn) note. Mirrors the access-scoping
 * pattern in lib/notes/queries.ts#createNote and lib/papers/queries.ts:
 * `user_id` is never a parameter, it is derived solely from
 * `supabase.auth.getUser()`. `note_text` is always written as null here —
 * a stroke note and a typed note are mutually exclusive (see design.md).
 */
export async function createStrokeNote(
  supabase: SupabaseClient,
  { paperId, pageNumber, strokes }: CreateStrokeNoteInput
) {
  const hasAnyPoints = strokes.some((stroke) => stroke.points.length > 0);
  if (!hasAnyPoints) {
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Cannot create a stroke note: no authenticated user.");
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      paper_id: paperId,
      page_number: pageNumber,
      note_text: null,
      strokes,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create stroke note: ${error.message}`);
  }

  return data;
}

/**
 * Deletes a stroke note by id. Mirrors the access-scoping pattern used
 * throughout this codebase: no `userId`/`user_id` parameter is accepted.
 * Ownership scoping is enforced entirely by the `notes_delete_own` RLS
 * policy (`for delete using (auth.uid() = user_id)`), so this function
 * does not perform any authorization checks of its own.
 */
export async function deleteStrokeNote(supabase: SupabaseClient, noteId: string): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", noteId);

  if (error) {
    throw new Error(`Failed to delete stroke note: ${error.message}`);
  }
}
