type SignInWithOtp = (args: {
  email: string;
  options: { emailRedirectTo: string };
}) => Promise<{ error: { message: string } | null }>;

export type MagicLinkResult = { ok: true } | { ok: false; message: string };

/**
 * Triggers a Supabase magic-link sign-in. Kept independent of any
 * particular SupabaseClient instance (the caller passes `signInWithOtp`)
 * so it can be unit tested without a live Supabase project.
 */
export async function requestMagicLink(
  email: string,
  signInWithOtp: SignInWithOtp
): Promise<MagicLinkResult> {
  if (!email.trim()) {
    return { ok: false, message: "請輸入 Email。" };
  }

  const redirectOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  const { error } = await signInWithOtp({
    email,
    options: { emailRedirectTo: `${redirectOrigin}/auth/callback` },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}
