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
  it("selects notes scoped to the given paper, ordered oldest first, relying on RLS for user scoping", async () => {
    const notes = [{ id: "n1", paper_id: "p1", note_text: "x" }];
    const orderMock = vi.fn().mockResolvedValue({ data: notes, error: null });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabase = { from: fromMock } as unknown as SupabaseClient;

    const result = await listNotesForPaper(supabase, "p1");

    expect(fromMock).toHaveBeenCalledWith("notes");
    expect(eqMock).toHaveBeenCalledWith("paper_id", "p1");
    expect(result).toEqual(notes);
  });
});
