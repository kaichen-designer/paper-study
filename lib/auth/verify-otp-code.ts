type VerifyOtp = (args: {
  email: string;
  token: string;
  type: "email";
}) => Promise<{ error: { message: string } | null }>;

export type VerifyOtpResult = { ok: true } | { ok: false; message: string };

/**
 * Verifies the 6-digit code Supabase includes in the sign-in email
 * alongside the magic link — a fallback for when the link itself can't be
 * used (e.g. an email scanner consumes the one-time link before the user
 * opens it, or the link is opened in a different browser/app than the one
 * that requested it). Kept independent of any particular SupabaseClient
 * instance so it can be unit tested without a live Supabase project,
 * matching requestMagicLink's pattern.
 */
export async function verifyOtpCode(
  email: string,
  token: string,
  verifyOtp: VerifyOtp
): Promise<VerifyOtpResult> {
  if (!token.trim()) {
    return { ok: false, message: "請輸入驗證碼。" };
  }

  const { error } = await verifyOtp({ email, token, type: "email" });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}
