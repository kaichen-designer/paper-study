import type { SupabaseClient } from "@supabase/supabase-js";
import type { Paper } from "@/lib/papers/queries";
import { setReadingStage } from "@/lib/papers/reading-stage";

/**
 * Marks that the reader has scrolled/paged to the last page of the paper.
 *
 * Access-scoping note: mirrors the pattern in lib/annotations/queries.ts —
 * no `userId`/`user_id` parameter is accepted. Ownership scoping is
 * enforced entirely by the `papers_update_own` RLS policy
 * (`for update using (auth.uid() = user_id)`), so this function performs
 * no authorization checks of its own.
 *
 * `.select().single()` is chained after `.update()` deliberately: without
 * it, an update that matches zero rows (wrong id, or a paper that isn't
 * the caller's own and is therefore invisible to the RLS policy) succeeds
 * silently with no data changed. Chaining `.select().single()` forces
 * PostgREST to return exactly one row or an explicit error, turning a
 * silent no-op into a thrown Error.
 */
export async function markReachedLastPage(supabase: SupabaseClient, paperId: string): Promise<void> {
  const { error } = await supabase
    .from("papers")
    .update({ reached_last_page: true })
    .eq("id", paperId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to mark reached last page: ${error.message}`);
  }
}

/**
 * Marks a paper as finished reading.
 *
 * Delegates to setReadingStage rather than writing `finished_reading`
 * directly: the library's stage column and this flag describe the same
 * fact, and a second writer is how they drift apart. The signature is
 * unchanged so callers need not care.
 */
export async function markFinishedReading(supabase: SupabaseClient, paperId: string): Promise<Paper> {
  return setReadingStage(supabase, paperId, "finished");
}
