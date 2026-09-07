import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * Single-user personal app: one shared browser client scoped by the
 * signed-in session via Supabase Auth + Row Level Security (see schema.sql).
 *
 * Must use @supabase/ssr's createBrowserClient (not plain
 * @supabase/supabase-js createClient) — it stores the session in cookies
 * and uses the PKCE flow, matching lib/supabase/server.ts and
 * middleware.ts's cookie-based server clients. Using the plain client here
 * would store the session in localStorage under the implicit flow, which
 * the server-side clients can never see, breaking the magic-link callback
 * (the browser would "sign in" but the server would never observe a
 * session, redirecting straight back to /login).
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey);
  }

  return browserClient;
}
