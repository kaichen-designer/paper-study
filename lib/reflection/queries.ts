import type { SupabaseClient } from "@supabase/supabase-js";

export type ReflectionRole = "user" | "assistant";

export type ReflectionMessage = {
  id: string;
  paper_id: string;
  user_id: string;
  role: ReflectionRole;
  content: string;
  created_at: string;
};

const TABLE = "reflection_messages";

/**
 * Lists a paper's reflection conversation, oldest first. No explicit
 * user_id filter — scoping to the signed-in user's own messages is
 * enforced by the reflection_messages_select_own RLS policy in
 * schema.sql, same pattern as lib/notes/queries.ts#listNotesForPaper.
 */
export async function listReflectionMessages(
  supabase: SupabaseClient,
  paperId: string
): Promise<ReflectionMessage[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("paper_id", paperId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list reflection messages: ${error.message}`);
  }

  return (data ?? []) as ReflectionMessage[];
}

/**
 * Saves one reflection message (user or assistant). Mirrors the
 * access-scoping pattern in lib/notes/queries.ts#createNote: `user_id` is
 * never a parameter, it is derived solely from `supabase.auth.getUser()`.
 */
export async function saveReflectionMessage(
  supabase: SupabaseClient,
  { paperId, role, content }: { paperId: string; role: ReflectionRole; content: string }
): Promise<ReflectionMessage> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Cannot save a reflection message: no authenticated user.");
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: user.id,
      paper_id: paperId,
      role,
      content,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save reflection message: ${error.message}`);
  }

  return data as ReflectionMessage;
}
