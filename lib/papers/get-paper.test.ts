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
      deleted_at: null,
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

  // IMPORTANT 5: a removed paper must 404 through the reader route, not
  // stay reachable and annotatable while sitting in the trash. Without
  // this, PaperCard's link removal is only cosmetic — the id is still a
  // live route.
  it("returns null for a paper that has been removed (deleted_at set), even though the row still exists", async () => {
    const trashedPaper = {
      id: "p1",
      user_id: "u1",
      title: "A",
      storage_path: "u1/a.pdf",
      uploaded_at: "now",
      metadata: {},
      deleted_at: "2026-09-20T00:00:00.000Z",
    };
    const singleMock = vi.fn().mockResolvedValue({ data: trashedPaper, error: null });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabase = { from: fromMock } as unknown as SupabaseClient;

    const result = await getPaperById(supabase, "p1");

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
