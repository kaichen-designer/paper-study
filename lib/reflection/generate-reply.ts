import type { SupabaseClient } from "@supabase/supabase-js";
import { callGemini, type GeminiResult } from "@/lib/gemini/client";
import { saveReflectionMessage, type ReflectionRole } from "./queries";

export type ConversationTurn = { role: ReflectionRole; content: string };

export type GenerateReflectionReplyResult =
  | { ok: true; reply: string }
  | { ok: false; message: string };

type Deps = {
  provider: (args: { prompt: string; apiKey: string; model?: string }) => Promise<GeminiResult>;
  saveMessage: typeof saveReflectionMessage;
};

const defaultDeps: Deps = {
  provider: callGemini,
  saveMessage: saveReflectionMessage,
};

// TEMPORARY: gemini-3.6-flash's free-tier daily quota (20 req/day) is
// exhausted. Gemini quota is tracked per model, so borrowing the lighter
// model translation already uses gets reflection chat back online today on
// a separate, unexhausted quota bucket. Revert to callGemini's own default
// (gemini-3.6-flash) once the quota resets or billing is upgraded.
const REFLECTION_MODEL = "gemini-3.1-flash-lite";

function buildPrompt({
  paperFullText,
  conversationHistory,
  userMessage,
}: {
  paperFullText: string;
  conversationHistory: ConversationTurn[];
  userMessage: string;
}): string {
  const historyText = conversationHistory
    .map((turn) => `${turn.role === "user" ? "使用者" : "AI"}: ${turn.content}`)
    .join("\n");

  return [
    "你是一個協助讀者深入理解學術論文的助教。以下是論文全文,讀者會針對這篇論文寫下心得或想法,請根據論文原文內容給出具體回饋——指出心得中理解正確或有誤的地方、補充論文中提到但心得沒提到的重點。不要給空泛的鼓勵語句。",
    "",
    "=== 論文全文 ===",
    paperFullText,
    "",
    historyText ? `=== 先前對話 ===\n${historyText}\n` : "",
    "=== 讀者這次的心得 ===",
    userMessage,
  ].join("\n");
}

/**
 * Orchestrates one reflection-chat turn: build a prompt grounded in the
 * paper's full text + prior conversation, call the provider, and persist
 * both the user's message and the assistant's reply only on success (see
 * design.md's "不寫入任何記錄" failure-mode requirement).
 */
export async function generateReflectionReply({
  supabase,
  paperId,
  paperFullText,
  conversationHistory,
  userMessage,
  apiKey,
  deps = defaultDeps,
}: {
  supabase: SupabaseClient;
  paperId: string;
  paperFullText: string;
  conversationHistory: ConversationTurn[];
  userMessage: string;
  apiKey: string;
  deps?: Deps;
}): Promise<GenerateReflectionReplyResult> {
  const prompt = buildPrompt({ paperFullText, conversationHistory, userMessage });

  const result = await deps.provider({ prompt, apiKey, model: REFLECTION_MODEL });
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  await deps.saveMessage(supabase, { paperId, role: "user", content: userMessage });
  await deps.saveMessage(supabase, { paperId, role: "assistant", content: result.text });

  return { ok: true, reply: result.text };
}
