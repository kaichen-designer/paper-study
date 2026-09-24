import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  insertPaper,
  listDeletedPapers,
  listPapers,
  purgePaper,
  renamePaper,
  restorePaper,
  softDeletePaper,
} from "./queries";

function makeListMock(result: { data: unknown; error: unknown }) {
  const orderMock = vi.fn().mockResolvedValue(result);
  // listPapers chains `.is("deleted_at", null)` between `.select()` and
  // `.order()` to hide removed papers from the library listing.
  const isMock = vi.fn().mockReturnValue({ order: orderMock });
  // `eq` stands in for any caller-injectable filter. listPapers has no
  // parameter surface for a filter, so this must never be invoked.
  const eqMock = vi.fn();
  const selectMock = vi.fn().mockReturnValue({ is: isMock, eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });

  const supabase = { from: fromMock } as unknown as SupabaseClient;

  return { supabase, fromMock, selectMock, isMock, orderMock, eqMock };
}

function makeInsertMock({
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

  const supabase = {
    from: fromMock,
    auth: { getUser: getUserMock },
  } as unknown as SupabaseClient;

  return { supabase, fromMock, insertMock, selectMock, singleMock, getUserMock };
}

describe("listPapers", () => {
  it("selects from papers ordered newest first, relying on RLS rather than a caller filter", async () => {
    const papers = [
      {
        id: "p1",
        user_id: "u1",
        title: "A",
        storage_path: "x",
        uploaded_at: "2024-01-02",
        metadata: {},
      },
    ];
    const { supabase, fromMock, selectMock, isMock, orderMock, eqMock } = makeListMock({
      data: papers,
      error: null,
    });

    const result = await listPapers(supabase);

    expect(fromMock).toHaveBeenCalledWith("papers");
    expect(selectMock).toHaveBeenCalled();
    expect(isMock).toHaveBeenCalledWith("deleted_at", null);
    expect(orderMock).toHaveBeenCalledWith("uploaded_at", { ascending: false });
    expect(eqMock).not.toHaveBeenCalled();
    expect(result).toEqual(papers);
  });

  it("does not accept a caller-supplied filter argument (only the client)", () => {
    // Guards against a future edit adding a `filter`/`userId` param that a
    // malicious caller could use to read another user's rows.
    expect(listPapers.length).toBe(1);
  });

  it("throws when Supabase returns an error instead of silently returning nothing", async () => {
    const { supabase } = makeListMock({ data: null, error: { message: "boom" } });

    await expect(listPapers(supabase)).rejects.toThrow(/boom/);
  });
});

describe("insertPaper", () => {
  it("derives user_id from auth.getUser(), never from the caller", async () => {
    const insertedRow = {
      id: "paper-1",
      user_id: "user-A",
      title: "T",
      storage_path: "s",
      uploaded_at: "now",
      metadata: { pages: 3 },
    };
    const { supabase, insertMock, getUserMock } = makeInsertMock({
      getUserResult: { data: { user: { id: "user-A" } }, error: null },
      insertResult: { data: insertedRow, error: null },
    });

    const result = await insertPaper(supabase, {
      title: "T",
      storagePath: "s",
      metadata: { pages: 3 },
    });

    expect(getUserMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-A",
        title: "T",
        storage_path: "s",
        metadata: { pages: 3 },
      })
    );
    expect(result).toEqual(insertedRow);
  });

  it("throws instead of silently inserting when there is no authenticated user", async () => {
    const { supabase, insertMock } = makeInsertMock({
      getUserResult: { data: { user: null }, error: null },
      insertResult: { data: null, error: null },
    });

    await expect(insertPaper(supabase, { title: "T", storagePath: "s" })).rejects.toThrow();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it.each([{ id: "user-A" }, { id: "user-B" }])(
    "always inserts with the id of whichever user is authenticated in that client instance ($id)",
    async ({ id }) => {
      const insertedRow = {
        id: "paper-x",
        user_id: id,
        title: "T",
        storage_path: "s",
        uploaded_at: "now",
        metadata: {},
      };
      const { supabase, insertMock } = makeInsertMock({
        getUserResult: { data: { user: { id } }, error: null },
        insertResult: { data: insertedRow, error: null },
      });

      await insertPaper(supabase, { title: "T", storagePath: "s" });

      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: id }));
    }
  );

  it("user A's client and user B's client each produce an insert scoped to their own id, never crossing over", async () => {
    const { supabase: supabaseA, insertMock: insertMockA } = makeInsertMock({
      getUserResult: { data: { user: { id: "user-A" } }, error: null },
      insertResult: { data: { id: "p1", user_id: "user-A" }, error: null },
    });
    const { supabase: supabaseB, insertMock: insertMockB } = makeInsertMock({
      getUserResult: { data: { user: { id: "user-B" } }, error: null },
      insertResult: { data: { id: "p2", user_id: "user-B" }, error: null },
    });

    await insertPaper(supabaseA, { title: "Paper A", storagePath: "a.pdf" });
    await insertPaper(supabaseB, { title: "Paper B", storagePath: "b.pdf" });

    expect(insertMockA).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-A" }));
    expect(insertMockA).not.toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-B" }));
    expect(insertMockB).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-B" }));
    expect(insertMockB).not.toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-A" }));
  });

  it("ignores a caller-supplied user_id even if one is smuggled in past the TS type", async () => {
    const { supabase, insertMock } = makeInsertMock({
      getUserResult: { data: { user: { id: "real-user" } }, error: null },
      insertResult: { data: { id: "p", user_id: "real-user" }, error: null },
    });

    const maliciousInput = {
      title: "T",
      storagePath: "s",
      user_id: "attacker-controlled",
    } as unknown as Parameters<typeof insertPaper>[1];

    await insertPaper(supabase, maliciousInput);

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: "real-user" }));
  });
});

describe("renamePaper", () => {
  function makeRenameMock() {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabase = {
      from: vi.fn().mockReturnValue({ update: updateMock }),
    } as unknown as SupabaseClient;
    return { supabase, updateMock };
  }

  it("stores the title with surrounding whitespace removed", async () => {
    const { supabase, updateMock } = makeRenameMock();

    await renamePaper(supabase, "p1", "  Attention Is All You Need  ");

    expect(updateMock).toHaveBeenCalledWith({ title: "Attention Is All You Need" });
  });

  it("rejects a title that is empty once trimmed, without writing", async () => {
    const { supabase, updateMock } = makeRenameMock();

    await expect(renamePaper(supabase, "p1", "   ")).rejects.toThrow();
    await expect(renamePaper(supabase, "p1", "")).rejects.toThrow();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("removal and restoration", () => {
  function makeListMock(rows: unknown[] = []) {
    const orderMock = vi.fn().mockResolvedValue({ data: rows, error: null });
    const isMock = vi.fn().mockReturnValue({ order: orderMock });
    const notMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ is: isMock, not: notMock });
    const supabase = {
      from: vi.fn().mockReturnValue({ select: selectMock }),
    } as unknown as SupabaseClient;
    return { supabase, isMock, notMock, orderMock };
  }

  function makeUpdateMock() {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabase = {
      from: vi.fn().mockReturnValue({ update: updateMock }),
    } as unknown as SupabaseClient;
    return { supabase, updateMock };
  }

  it("hides removed papers from the library listing", async () => {
    const { supabase, isMock } = makeListMock();

    await listPapers(supabase);

    expect(isMock).toHaveBeenCalledWith("deleted_at", null);
  });

  it("lists only removed papers, most recently removed first", async () => {
    const { supabase, notMock, orderMock } = makeListMock();

    await listDeletedPapers(supabase);

    expect(notMock).toHaveBeenCalledWith("deleted_at", "is", null);
    expect(orderMock).toHaveBeenCalledWith("deleted_at", { ascending: false });
  });

  it("stamps the removal time rather than destroying the row", async () => {
    const { supabase, updateMock } = makeUpdateMock();

    await softDeletePaper(supabase, "p1");

    expect(typeof updateMock.mock.calls[0][0].deleted_at).toBe("string");
  });

  it("restores a paper without touching its reading stage", async () => {
    const { supabase, updateMock } = makeUpdateMock();

    await restorePaper(supabase, "p1");

    expect(updateMock).toHaveBeenCalledWith({ deleted_at: null });
  });
});

describe("purgePaper", () => {
  function makePurgeMock(storageError: unknown = null) {
    const order: string[] = [];
    const singleMock = vi.fn().mockImplementation(async () => {
      order.push("row");
      return { data: { id: "p1" }, error: null };
    });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    // purgePaper chains `.not("deleted_at", "is", null)` between `.eq()`
    // and `.select()` so the delete can only ever match a row that is
    // currently in the trash (IMPORTANT 4).
    const notMock = vi.fn().mockReturnValue({ select: selectMock });
    const eqMock = vi.fn().mockReturnValue({ not: notMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
    const removeMock = vi.fn().mockImplementation(async () => {
      order.push("storage");
      return { error: storageError };
    });
    const supabase = {
      from: vi.fn().mockReturnValue({ delete: deleteMock }),
      storage: { from: vi.fn().mockReturnValue({ remove: removeMock }) },
    } as unknown as SupabaseClient;
    return { supabase, order, removeMock, eqMock, notMock };
  }

  it("deletes the row before the stored file, so no paper can point at a missing file", async () => {
    const { supabase, order, removeMock, eqMock, notMock } = makePurgeMock();

    await purgePaper(supabase, { id: "p1", storage_path: "u1/p1.pdf" });

    expect(order).toEqual(["row", "storage"]);
    expect(eqMock).toHaveBeenCalledWith("id", "p1");
    expect(notMock).toHaveBeenCalledWith("deleted_at", "is", null);
    expect(removeMock).toHaveBeenCalledWith(["u1/p1.pdf"]);
  });

  it("still succeeds when the stored file cannot be deleted", async () => {
    const { supabase } = makePurgeMock({ message: "not found" });

    await expect(
      purgePaper(supabase, { id: "p1", storage_path: "u1/p1.pdf" })
    ).resolves.toBeUndefined();
  });

  it("does not permanently delete a paper that is not currently in the trash", async () => {
    // Simulates the .not("deleted_at", "is", null) filter matching zero
    // rows for a paper that was restored (or never removed): .single()
    // sees no row and errors, exactly as it does for a wrong/missing id.
    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "JSON object requested, multiple (or no) rows returned" },
    });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const notMock = vi.fn().mockReturnValue({ select: selectMock });
    const eqMock = vi.fn().mockReturnValue({ not: notMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
    const removeMock = vi.fn();
    const supabase = {
      from: vi.fn().mockReturnValue({ delete: deleteMock }),
      storage: { from: vi.fn().mockReturnValue({ remove: removeMock }) },
    } as unknown as SupabaseClient;

    await expect(
      purgePaper(supabase, { id: "p1", storage_path: "u1/p1.pdf" })
    ).rejects.toThrow();

    expect(notMock).toHaveBeenCalledWith("deleted_at", "is", null);
    // The row delete failed to match, so the file must never be touched.
    expect(removeMock).not.toHaveBeenCalled();
  });
});
