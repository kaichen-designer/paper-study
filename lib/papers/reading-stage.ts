import type { SupabaseClient } from "@supabase/supabase-js";
import type { Paper } from "@/lib/papers/queries";

export type ReadingStage = "up_next" | "reading" | "finished";

export const READING_STAGES: readonly ReadingStage[] = ["reading", "up_next", "finished"];

/** Display order is deliberate: what you are reading now comes first. */
export const STAGE_LABELS: Record<ReadingStage, string> = {
  reading: "正在讀",
  up_next: "接下來要讀",
  finished: "讀完了",
};

/**
 * The ONLY writer of a paper's reading stage, and therefore the only
 * writer of `finished_reading` and `finished_at`.
 *
 * `finished_reading` predates the stage column and is still read by the
 * reading view. Two independent writers would eventually disagree — the
 * library saying finished while the reader says not — so every path that
 * changes completion goes through here and sets all three fields in one
 * update.
 *
 * Access-scoping note: no `userId` parameter, matching
 * lib/reading-completion/queries.ts. `.select().single()` turns a
 * zero-row match (wrong id, or a row the RLS policy hides) into a thrown
 * error rather than a silent no-op.
 */
export async function setReadingStage(
  supabase: SupabaseClient,
  paperId: string,
  stage: ReadingStage
): Promise<Paper> {
  if (!READING_STAGES.includes(stage)) {
    throw new Error(`Unknown reading stage: ${stage}`);
  }

  const finished = stage === "finished";
  const { data, error } = await supabase
    .from("papers")
    .update({
      reading_stage: stage,
      finished_reading: finished,
      finished_at: finished ? new Date().toISOString() : null,
    })
    .eq("id", paperId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to set reading stage: ${error.message}`);
  }

  return data as Paper;
}
