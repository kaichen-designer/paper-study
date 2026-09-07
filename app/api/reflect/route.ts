import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listReflectionMessages } from "@/lib/reflection/queries";
import { generateReflectionReply } from "@/lib/reflection/generate-reply";

// GEMINI_API_KEY is intentionally read only here, server-side, and never
// forwarded to the client in any response body or exposed via
// NEXT_PUBLIC_*. Shared with /api/translate — same key, same rule.
export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "伺服器尚未設定 GEMINI_API_KEY,無法使用心得對話。" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const paperId = typeof body?.paperId === "string" ? body.paperId : null;
  const message = typeof body?.message === "string" ? body.message : null;
  const paperFullText = typeof body?.paperFullText === "string" ? body.paperFullText : null;

  if (!paperId || !message || !paperFullText) {
    return NextResponse.json(
      { error: "缺少 paperId、message 或 paperFullText 參數。" },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseServerClient();
  const history = await listReflectionMessages(supabase, paperId);

  const result = await generateReflectionReply({
    supabase,
    paperId,
    paperFullText,
    conversationHistory: history.map((m) => ({ role: m.role, content: m.content })),
    userMessage: message,
    apiKey,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }

  return NextResponse.json({ reply: result.reply });
}
