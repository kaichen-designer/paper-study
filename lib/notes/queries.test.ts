import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNote, listNotesForPaper } from "./queries";

function makeCreateMock({
  getUserResult,
  insertResult,
}: {
  getUserResult: { data: { user: { id: string } | null }; error: unknown };
  insertResult: { data: unknown; error: unknown };
}) {
  const singleMock = vi.fn().mockResolvedValue(insertResult);
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const insertMock = vi.fn().mockReturnValue({ select: selectMock });
  const fromMock = vi.fn().mockReturnValue({ insert: insertMock });
  const getUserMock = vi.fn().mockResolvedValue(getUserResult);
  const supabase = { from: fromMock, auth: { getUser: getUserMock } } as unknown as SupabaseClient;
  return { supabase, fromMock, insertMock, getUserMock };
}

describe("createNote", () => {
  it("derives user_id from auth.getUser(), never from the caller, mirroring lib/papers/queries.ts", async () => {
    const { supabase, insertMock, getUserMock } = makeCreateMock({
      getUserResult: { data: { user: { id: "user-A" } }, error: null },
      insertResult: {
        data: { id: "n1", paper_id: "p1", user_id: "user-A", note_text: "重要", page_number: 2 },
        error: null,
      },
    });

    await createNote(supabase, {
      paperId: "p1",
      pageNumber: 2,
      selectedText: "excerpt",
      noteText: "重要",
    });

    expect(getUserMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-A",
        paper_id: "p1",
        page_number: 2,
        selected_text: "excerpt",
        note_text: "重要",
      })
    );
  });

  it("throws instead of silently creating a note when there is no authenticated user", async () => {
    const { supabase, insertMock } = makeCreateMock({
      getUserResult: { data: { user: null }, error: null },
      insertResult: { data: null, error: null },
    });

    await expect(
      createNote(supabase, { paperId: "p1", pageNumber: 1, noteText: "x" })
    ).rejects.toThrow();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("listNotesForPaper", () => {
  /** Serves `pages` in order, one per range() call. */
  function makeListMock(pages: unknown[][]) {
    const rangeMock = vi.fn();
    for (const page of pages) {
      rangeMock.mockResolvedValueOnce({ data: page, error: null });
    }
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabase = { from: fromMock } as unknown as SupabaseClient;
    return { supabase, fromMock, eqMock, orderMock, rangeMock };
  }

  it("selects notes scoped to the given paper, ordered oldest first, relying on RLS for user scoping", async () => {
    const notes = [{ id: "n1", paper_id: "p1", note_text: "x" }];
    const { supabase, fromMock, eqMock, orderMock } = makeListMock([notes]);

    const result = await listNotesForPaper(supabase, "p1");

    expect(fromMock).toHaveBeenCalledWith("notes");
    expect(eqMock).toHaveBeenCalledWith("paper_id", "p1");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result).toEqual(notes);
  });

  it("keeps requesting pages until one comes back short, so the server's own row cap cannot truncate the result", async () => {
    // An unbounded select is still capped by the server's default row
    // limit. Ordered oldest first, hitting that cap drops the NEWEST
    // notes: a stroke saves without error, stays on screen, and is gone
    // after a reload.
    const firstPage = Array.from({ length: 500 }, (_, index) => ({ id: `a${index}` }));
    const secondPage = Array.from({ length: 500 }, (_, index) => ({ id: `b${index}` }));
    const lastPage = [{ id: "c0" }];
    const { supabase, rangeMock } = makeListMock([firstPage, secondPage, lastPage]);

    const result = await listNotesForPaper(supabase, "p1");

    expect(result).toHaveLength(1001);
    expect(result.at(-1)).toEqual({ id: "c0" });
    expect(rangeMock).toHaveBeenNthCalledWith(1, 0, 499);
    expect(rangeMock).toHaveBeenNthCalledWith(2, 500, 999);
    expect(rangeMock).toHaveBeenNthCalledWith(3, 1000, 1499);
  });

  it("stops after a single request when the first page is already short", async () => {
    const { supabase, rangeMock } = makeListMock([[{ id: "n1" }]]);

    await listNotesForPaper(supabase, "p1");

    // Asking again would return nothing and cost a round trip.
    expect(rangeMock).toHaveBeenCalledTimes(1);
  });

  it("stops on an exactly-full final page instead of looping forever", async () => {
    const fullPage = Array.from({ length: 500 }, (_, index) => ({ id: `a${index}` }));
    const { supabase, rangeMock } = makeListMock([fullPage, []]);

    const result = await listNotesForPaper(supabase, "p1");

    expect(result).toHaveLength(500);
    expect(rangeMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces an error from any page rather than returning a partial list", async () => {
    const fullPage = Array.from({ length: 500 }, (_, index) => ({ id: `a${index}` }));
    const rangeMock = vi
      .fn()
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabase = { from: vi.fn().mockReturnValue({ select: selectMock }) } as unknown as SupabaseClient;

    // Silently returning the pages that did load would look exactly like
    // the truncation this pagination exists to prevent.
    await expect(listNotesForPaper(supabase, "p1")).rejects.toThrow("boom");
  });
});
