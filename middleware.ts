import type { NextRequest } from "next/server";
import { updateSessionAndGuard } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSessionAndGuard(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|workbox-).*)"],
};
