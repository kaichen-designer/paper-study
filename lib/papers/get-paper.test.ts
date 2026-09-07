import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaperById, getPaperSignedUrl } from "./get-paper";

describe("getPaperById", () => {
  it("selects a single paper by id, relying on RLS to scope it to the caller's own rows", async () => {
    const paper = {
      id: "p1",
      user_id: "u1",
      title: "A",
      storage_path: "u1/a.pdf",
      uploaded_at: "now",
      metadata: {},
    };
    const singleMock = vi.fn().mockResolvedValue({ data: paper, error: null });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabase = { from: fromMock } as unknown as SupabaseClient;

    const result = await getPaperById(supabase, "p1");

    expect(fromMock).toHaveBeenCalledWith("papers");
    expect(eqMock).toHaveBeenCalledWith("id", "p1");
    expect(result).toEqual(paper);
  });

  it("returns null when no matching paper is found (e.g. it belongs to another user)", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabase = { from: fromMock } as unknown as SupabaseClient;

    const result = await getPaperById(supabase, "someone-elses-paper");

    expect(result).toBeNull();
  });
});

describe("getPaperSignedUrl", () => {
  it("requests a time-limited signed URL for the paper's storage path", async () => {
    const createSignedUrlMock = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: "https://x/signed" }, error: null });
    const fromMock = vi.fn().mockReturnValue({ createSignedUrl: createSignedUrlMock });
    const supabase = { storage: { from: fromMock } } as unknown as SupabaseClient;

    const url = await getPaperSignedUrl(supabase, "u1/a.pdf");

    expect(fromMock).toHaveBeenCalledWith("papers");
    expect(createSignedUrlMock).toHaveBeenCalledWith("u1/a.pdf", 60 * 5);
    expect(url).toBe("https://x/signed");
  });

  it("throws instead of silently returning an unusable URL when signing fails", async () => {
    const createSignedUrlMock = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "not found" } });
    const fromMock = vi.fn().mockReturnValue({ createSignedUrl: createSignedUrlMock });
    const supabase = { storage: { from: fromMock } } as unknown as SupabaseClient;

    await expect(getPaperSignedUrl(supabase, "missing.pdf")).rejects.toThrow();
  });
});
