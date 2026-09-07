import { describe, expect, it, vi } from "vitest";
import { requestMagicLink } from "./request-magic-link";

describe("requestMagicLink", () => {
  it("returns ok when Supabase accepts the sign-in request", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });

    const result = await requestMagicLink("reader@example.com", signInWithOtp);

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "reader@example.com",
      options: { emailRedirectTo: expect.stringContaining("/auth/callback") },
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns the error message when Supabase rejects the sign-in request", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: { message: "Rate limited" } });

    const result = await requestMagicLink("reader@example.com", signInWithOtp);

    expect(result).toEqual({ ok: false, message: "Rate limited" });
  });

  it("rejects an empty email before calling Supabase", async () => {
    const signInWithOtp = vi.fn();

    const result = await requestMagicLink("", signInWithOtp);

    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
