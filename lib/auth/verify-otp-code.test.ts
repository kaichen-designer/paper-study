import { describe, expect, it, vi } from "vitest";
import { verifyOtpCode } from "./verify-otp-code";

describe("verifyOtpCode", () => {
  it("returns ok when Supabase accepts the code", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });

    const result = await verifyOtpCode("reader@example.com", "123456", verifyOtp);

    expect(verifyOtp).toHaveBeenCalledWith({
      email: "reader@example.com",
      token: "123456",
      type: "email",
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns the error message when Supabase rejects the code", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: { message: "Token has expired" } });

    const result = await verifyOtpCode("reader@example.com", "000000", verifyOtp);

    expect(result).toEqual({ ok: false, message: "Token has expired" });
  });

  it("rejects an empty code before calling Supabase", async () => {
    const verifyOtp = vi.fn();

    const result = await verifyOtpCode("reader@example.com", "", verifyOtp);

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
