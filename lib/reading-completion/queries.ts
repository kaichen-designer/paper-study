import type { SupabaseClient } from "@supabase/supabase-js";
import type { Paper } from "@/lib/papers/queries";

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
 * Marks a paper as finished reading, stamping `finished_at` with the
 * current time.
 *
 * Access-scoping note: same pattern as markReachedLastPage above — no
 * `userId`/`user_id` parameter, relying entirely on the `papers_update_own`
 * RLS policy. `.select().single()` after `.update()` is deliberate for the
 * same reason: it turns a zero-row match (wrong id, or blocked by RLS)
 * into an explicit thrown Error instead of a silent no-op.
 */
export async function markFinishedReading(supabase: SupabaseClient, paperId: string): Promise<Paper> {
  const { data, error } = await supabase
    .from("papers")
    .update({ finished_reading: true, finished_at: new Date().toISOString() })
    .eq("id", paperId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to mark finished reading: ${error.message}`);
  }

  return data as Paper;
}
