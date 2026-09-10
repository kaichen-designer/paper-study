import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=登入連結缺少必要參數,請重新寄送。", request.url)
    );
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Most commonly a PKCE code-verifier mismatch: the link was requested
    // in one browser/app (e.g. the installed PWA, or Chrome) and opened in
    // another (e.g. Safari) — each has its own separate cookie storage on
    // iOS, so the verifier set at request time isn't visible here. Surface
    // this instead of silently redirecting to /library, which middleware
    // would just bounce back to /login with no explanation.
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(
          "登入連結無法使用,請確認是在同一個瀏覽器 App 中請求並開啟連結(例如都用 Safari),然後重新寄送。"
        )}`,
        request.url
      )
    );
  }

  return NextResponse.redirect(new URL("/library", request.url));
}
