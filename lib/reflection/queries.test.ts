import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listReflectionMessages, saveReflectionMessage } from "./queries";

describe("listReflectionMessages", () => {
  it("selects messages for the paper, ordered oldest first, relying on RLS for user scoping", async () => {
    const messages = [{ id: "m1", role: "user", content: "hi" }];
    const orderMock = vi.fn().mockResolvedValue({ data: messages, error: null });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabase = { from: fromMock } as unknown as SupabaseClient;

    const result = await listReflectionMessages(supabase, "p1");

    expect(fromMock).toHaveBeenCalledWith("reflection_messages");
    expect(eqMock).toHaveBeenCalledWith("paper_id", "p1");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result).toEqual(messages);
  });
});

describe("saveReflectionMessage", () => {
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
    const supabase = {
      from: fromMock,
      auth: { getUser: getUserMock },
    } as unknown as SupabaseClient;
    return { supabase, fromMock, insertMock, getUserMock };
  }

  it("derives user_id from auth.getUser(), never from the caller, mirroring lib/notes/queries.ts", async () => {
    const { supabase, insertMock, getUserMock } = makeMock({
      getUserResult: { data: { user: { id: "user-A" } }, error: null },
      insertResult: { data: { id: "m1", role: "user", content: "hi" }, error: null },
    });

    await saveReflectionMessage(supabase, { paperId: "p1", role: "user", content: "hi" });

    expect(getUserMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-A",
        paper_id: "p1",
        role: "user",
        content: "hi",
      })
    );
  });

  it("always inserts with the id of whichever user is authenticated in that client instance, never crossing over", async () => {
    const { supabase: supabaseA, insertMock: insertMockA } = makeMock({
      getUserResult: { data: { user: { id: "user-A" } }, error: null },
      insertResult: { data: { id: "m1" }, error: null },
    });
    const { supabase: supabaseB, insertMock: insertMockB } = makeMock({
      getUserResult: { data: { user: { id: "user-B" } }, error: null },
      insertResult: { data: { id: "m2" }, error: null },
    });

    await saveReflectionMessage(supabaseA, { paperId: "p1", role: "user", content: "a" });
    await saveReflectionMessage(supabaseB, { paperId: "p1", role: "user", content: "b" });

    expect(insertMockA).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-A" }));
    expect(insertMockA).not.toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-B" }));
    expect(insertMockB).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-B" }));
  });

  it("throws instead of silently creating a message when there is no authenticated user", async () => {
    const { supabase, insertMock } = makeMock({
      getUserResult: { data: { user: null }, error: null },
      insertResult: { data: null, error: null },
    });

    await expect(
      saveReflectionMessage(supabase, { paperId: "p1", role: "user", content: "hi" })
    ).rejects.toThrow();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
