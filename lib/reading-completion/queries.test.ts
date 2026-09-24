import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markFinishedReading, markReachedLastPage } from "./queries";

function makeMock({ result }: { result: { data: unknown; error: unknown } }) {
  const singleMock = vi.fn().mockResolvedValue(result);
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const eqMock = vi.fn().mockReturnValue({ select: selectMock });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ update: updateMock });
  const supabase = { from: fromMock } as unknown as SupabaseClient;
  return { supabase, fromMock, updateMock, eqMock, selectMock, singleMock };
}

describe("markReachedLastPage", () => {
  it("updates the papers row with reached_last_page: true, scoped by id", async () => {
    const { supabase, fromMock, updateMock, eqMock } = makeMock({
      result: { data: { id: "p1", reached_last_page: true }, error: null },
    });

    await markReachedLastPage(supabase, "p1");

    expect(fromMock).toHaveBeenCalledWith("papers");
    expect(updateMock).toHaveBeenCalledWith({ reached_last_page: true });
    expect(eqMock).toHaveBeenCalledWith("id", "p1");
  });

  it("throws when Supabase reports an error (e.g. zero rows matched / RLS block)", async () => {
    const { supabase } = makeMock({
      result: { data: null, error: { message: "row-level security violation" } },
    });

    await expect(markReachedLastPage(supabase, "p1")).rejects.toThrow();
  });
});

describe("markFinishedReading", () => {
  it("updates the papers row with finished_reading: true and a finished_at timestamp, returning the row", async () => {
    const updatedRow = { id: "p1", finished_reading: true, finished_at: "2026-09-07T00:00:00.000Z" };
    const { supabase, fromMock, updateMock, eqMock } = makeMock({
      result: { data: updatedRow, error: null },
    });

    const result = await markFinishedReading(supabase, "p1");

    expect(fromMock).toHaveBeenCalledWith("papers");
    expect(eqMock).toHaveBeenCalledWith("id", "p1");
    const body = updateMock.mock.calls[0][0];
    expect(body.finished_reading).toBe(true);
    expect(typeof body.finished_at).toBe("string");
    expect(body.finished_at.length).toBeGreaterThan(0);
    expect(result).toEqual(updatedRow);
  });

  it("throws when Supabase reports an error (e.g. zero rows matched / RLS block)", async () => {
    const { supabase } = makeMock({
      result: { data: null, error: { message: "row-level security violation" } },
    });

    await expect(markFinishedReading(supabase, "p1")).rejects.toThrow();
  });

  it("sets the reading stage as well, so the library and the reader cannot disagree", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabase = {
      from: vi.fn().mockReturnValue({ update: updateMock }),
    } as unknown as SupabaseClient;

    await markFinishedReading(supabase, "p1");

    expect(updateMock.mock.calls[0][0]).toMatchObject({
      reading_stage: "finished",
      finished_reading: true,
    });
  });
});
