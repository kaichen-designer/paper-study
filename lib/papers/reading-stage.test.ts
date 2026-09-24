import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setReadingStage } from "./reading-stage";

function makeUpdateMock(result: { data: unknown; error: unknown } = { data: { id: "p1" }, error: null }) {
  const singleMock = vi.fn().mockResolvedValue(result);
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const eqMock = vi.fn().mockReturnValue({ select: selectMock });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ update: updateMock });
  const supabase = { from: fromMock } as unknown as SupabaseClient;
  return { supabase, fromMock, updateMock, eqMock };
}

describe("setReadingStage", () => {
  it("records completion when the stage becomes finished", async () => {
    const { supabase, updateMock, eqMock } = makeUpdateMock();

    await setReadingStage(supabase, "p1", "finished");

    const patch = updateMock.mock.calls[0][0];
    expect(patch.reading_stage).toBe("finished");
    expect(patch.finished_reading).toBe(true);
    expect(typeof patch.finished_at).toBe("string");
    expect(eqMock).toHaveBeenCalledWith("id", "p1");
  });

  it("clears completion when the stage moves away from finished", async () => {
    const { supabase, updateMock } = makeUpdateMock();

    await setReadingStage(supabase, "p1", "reading");

    const patch = updateMock.mock.calls[0][0];
    expect(patch.reading_stage).toBe("reading");
    expect(patch.finished_reading).toBe(false);
    expect(patch.finished_at).toBeNull();
  });

  it("writes reading_stage, finished_reading and finished_at together, so the two cannot disagree", async () => {
    const { supabase, updateMock } = makeUpdateMock();

    await setReadingStage(supabase, "p1", "up_next");

    expect(Object.keys(updateMock.mock.calls[0][0]).sort()).toEqual([
      "finished_at",
      "finished_reading",
      "reading_stage",
    ]);
  });

  it("rejects a stage outside the three known values", async () => {
    const { supabase, updateMock } = makeUpdateMock();

    await expect(
      setReadingStage(supabase, "p1", "archived" as never)
    ).rejects.toThrow("archived");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("throws when the update matches no row, instead of succeeding silently", async () => {
    const { supabase } = makeUpdateMock({ data: null, error: { message: "no rows" } });

    await expect(setReadingStage(supabase, "p1", "reading")).rejects.toThrow("no rows");
  });
});
