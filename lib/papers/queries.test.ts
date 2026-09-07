import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertPaper, listPapers } from "./queries";

function makeListMock(result: { data: unknown; error: unknown }) {
  const orderMock = vi.fn().mockResolvedValue(result);
  // `eq` stands in for any caller-injectable filter. listPapers has no
  // parameter surface for a filter, so this must never be invoked.
  const eqMock = vi.fn();
  const selectMock = vi.fn().mockReturnValue({ order: orderMock, eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });

  const supabase = { from: fromMock } as unknown as SupabaseClient;

  return { supabase, fromMock, selectMock, orderMock, eqMock };
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
    const { supabase, fromMock, selectMock, orderMock, eqMock } = makeListMock({
      data: papers,
      error: null,
    });

    const result = await listPapers(supabase);

    expect(fromMock).toHaveBeenCalledWith("papers");
    expect(selectMock).toHaveBeenCalled();
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
