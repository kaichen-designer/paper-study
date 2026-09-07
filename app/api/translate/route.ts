import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { translateText } from "@/lib/translation/translate-text";

// GEMINI_API_KEY is intentionally read only here, server-side, and never
// forwarded to the client in any response body or exposed via
// NEXT_PUBLIC_*. This route is the only place that touches it.
export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "伺服器尚未設定 GEMINI_API_KEY,無法翻譯。" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : null;
  const targetLang = typeof body?.targetLang === "string" ? body.targetLang : null;
  const sourceLang = typeof body?.sourceLang === "string" ? body.sourceLang : "EN";
  const paperId = typeof body?.paperId === "string" ? body.paperId : undefined;

  if (!text || !targetLang) {
    return NextResponse.json({ error: "缺少 text 或 targetLang 參數。" }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();

  const result = await translateText({
    supabase,
    text,
    sourceLang,
    targetLang,
    apiKey,
    paperId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }

  return NextResponse.json({ translatedText: result.text, cached: result.cached });
}
