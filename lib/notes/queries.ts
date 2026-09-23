import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stroke } from "@/lib/annotations/queries";

// A note is either typed (note_text set, strokes null) or a hand-drawn
// annotation (strokes set, note_text null) — see apple-pencil-annotations
// design.md. The two are mutually exclusive by construction: createNote
// always writes strokes: null, createStrokeNote always writes
// note_text: null.
export type Note = {
  id: string;
  paper_id: string;
  user_id: string;
  page_number: number;
  position: unknown;
  selected_text: string | null;
  note_text: string | null;
  strokes?: Stroke[] | null;
  created_at: string;
};

export type CreateNoteInput = {
  paperId: string;
  pageNumber: number;
  position?: unknown;
  selectedText?: string;
  noteText: string;
};

/**
 * Creates a note bound to a paper, page, and selection. Follows the same
 * access-scoping pattern as lib/papers/queries.ts: `user_id` is never a
 * parameter, it is derived solely from `supabase.auth.getUser()`, so a
 * caller has no way to create a note owned by another user. The backend
 * source of truth is Postgres (see notes table in schema.sql) — the source
 * is deliberately not local-only storage, so a signed-in note is available
 * on any device (Requirement: Cross-Device Note Sync) and survives local
 * cache eviction (Requirement: Note Persistence).
 */
export async function createNote(
  supabase: SupabaseClient,
  { paperId, pageNumber, position, selectedText, noteText }: CreateNoteInput
): Promise<Note> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Cannot create a note: no authenticated user.");
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      paper_id: paperId,
      page_number: pageNumber,
      position: position ?? null,
      selected_text: selectedText ?? null,
      note_text: noteText,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create note: ${error.message}`);
  }

  return data as Note;
}

/**
 * Lists notes for a paper, oldest first. Has no explicit user_id filter —
 * scoping to the signed-in user's own notes is enforced by the
 * `notes_select_own` RLS policy in schema.sql, same pattern as
 * lib/papers/queries.ts#listPapers.
 */
const NOTES_PAGE_SIZE = 500;

export async function listNotesForPaper(
  supabase: SupabaseClient,
  paperId: string
): Promise<Note[]> {
  // Paged deliberately. An unbounded select is still capped by the
  // server's own default row limit, and because this is ordered oldest
  // first, hitting that cap silently drops the NEWEST notes -- a stroke
  // saves without error, stays on screen, and is gone after a reload,
  // which is indistinguishable from it never having been saved.
  const all: Note[] = [];
  for (let offset = 0; ; offset += NOTES_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("paper_id", paperId)
      .order("created_at", { ascending: true })
      .range(offset, offset + NOTES_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to list notes: ${error.message}`);
    }

    const page = (data ?? []) as Note[];
    all.push(...page);
    // A short page means this was the last one. Asking again would
    // return nothing and cost a round trip.
    if (page.length < NOTES_PAGE_SIZE) break;
  }

  return all;
}
