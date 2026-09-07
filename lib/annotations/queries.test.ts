import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStrokeNote, deleteStrokeNote } from "./queries";
import type { Point } from "./stroke-geometry";

function makeMock({
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

const sampleStrokes: { points: Point[] }[] = [
  { points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] },
];

describe("createStrokeNote", () => {
  it("derives user_id from auth.getUser(), never from the caller, mirroring lib/papers/queries.ts", async () => {
    const { supabase, insertMock, getUserMock } = makeMock({
      getUserResult: { data: { user: { id: "user-A" } }, error: null },
      insertResult: {
        data: { id: "n1", paper_id: "p1", user_id: "user-A", strokes: sampleStrokes },
        error: null,
      },
    });

    await createStrokeNote(supabase, { paperId: "p1", pageNumber: 2, strokes: sampleStrokes });

    expect(getUserMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-A",
        paper_id: "p1",
        page_number: 2,
        note_text: null,
        strokes: sampleStrokes,
      })
    );
  });

  it("always inserts with the id of whichever user is authenticated in that client instance, never crossing over", async () => {
    const { supabase: supabaseA, insertMock: insertMockA } = makeMock({
      getUserResult: { data: { user: { id: "user-A" } }, error: null },
      insertResult: { data: { id: "n1", user_id: "user-A" }, error: null },
    });
    const { supabase: supabaseB, insertMock: insertMockB } = makeMock({
      getUserResult: { data: { user: { id: "user-B" } }, error: null },
      insertResult: { data: { id: "n2", user_id: "user-B" }, error: null },
    });

    await createStrokeNote(supabaseA, { paperId: "p1", pageNumber: 1, strokes: sampleStrokes });
    await createStrokeNote(supabaseB, { paperId: "p1", pageNumber: 1, strokes: sampleStrokes });

    expect(insertMockA).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-A" }));
    expect(insertMockA).not.toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-B" }));
    expect(insertMockB).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-B" }));
  });

  it("throws instead of silently creating a note when there is no authenticated user", async () => {
    const { supabase, insertMock } = makeMock({
      getUserResult: { data: { user: null }, error: null },
      insertResult: { data: null, error: null },
    });

    await expect(
      createStrokeNote(supabase, { paperId: "p1", pageNumber: 1, strokes: sampleStrokes })
    ).rejects.toThrow();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("does not insert an empty note when strokes has no points", async () => {
    const { supabase, insertMock } = makeMock({
      getUserResult: { data: { user: { id: "user-A" } }, error: null },
      insertResult: { data: null, error: null },
    });

    await createStrokeNote(supabase, { paperId: "p1", pageNumber: 1, strokes: [] });

    expect(insertMock).not.toHaveBeenCalled();
  });

  it("does not insert when every stroke has an empty points array", async () => {
    const { supabase, insertMock } = makeMock({
      getUserResult: { data: { user: { id: "user-A" } }, error: null },
      insertResult: { data: null, error: null },
    });

    await createStrokeNote(supabase, {
      paperId: "p1",
      pageNumber: 1,
      strokes: [{ points: [] }],
    });

    expect(insertMock).not.toHaveBeenCalled();
  });
});

function makeDeleteMock({ deleteResult }: { deleteResult: { error: unknown } }) {
  const eqMock = vi.fn().mockResolvedValue(deleteResult);
  const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ delete: deleteMock });
  const supabase = { from: fromMock } as unknown as SupabaseClient;
  return { supabase, fromMock, deleteMock, eqMock };
}

describe("deleteStrokeNote", () => {
  it("deletes the note by id, relying on the notes_delete_own RLS policy for ownership scoping", async () => {
    const { supabase, fromMock, eqMock } = makeDeleteMock({
      deleteResult: { error: null },
    });

    await deleteStrokeNote(supabase, "note-1");

    expect(fromMock).toHaveBeenCalledWith("notes");
    expect(eqMock).toHaveBeenCalledWith("id", "note-1");
  });

  it("throws when Supabase reports an error deleting the note", async () => {
    const { supabase } = makeDeleteMock({
      deleteResult: { error: { message: "row-level security violation" } },
    });

    await expect(deleteStrokeNote(supabase, "note-1")).rejects.toThrow();
  });
});
