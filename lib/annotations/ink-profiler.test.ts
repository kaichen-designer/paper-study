import { describe, expect, test, vi } from "vitest";
import {
  InkProfiler,
  formatReport,
  inkDebugEnabled,
  summarize,
  touchActionOverride,
} from "./ink-profiler";

describe("summarize", () => {
  test("returns zeroes for no samples rather than NaN", () => {
    expect(summarize([])).toEqual({ median: 0, p95: 0, max: 0 });
  });

  test("reports median, p95 and max from unsorted input", () => {
    // Even sample count takes the upper median (index 5 of 10) — exact
    // enough for a diagnostic, and avoids inventing a value that was
    // never actually measured.
    const values = [50, 1, 3, 2, 4, 5, 6, 7, 8, 9];
    const stats = summarize(values);
    expect(stats.max).toBe(50);
    expect(stats.median).toBe(6);
    expect(stats.p95).toBe(50);
  });
});

describe("inkDebugEnabled", () => {
  test("is off by default so normal page loads pay nothing", () => {
    expect(inkDebugEnabled("")).toBe(false);
    expect(inkDebugEnabled("?page=3")).toBe(false);
  });

  test("is on with the explicit opt-in flag", () => {
    expect(inkDebugEnabled("?inkdebug=1")).toBe(true);
    expect(inkDebugEnabled("?page=3&inkdebug=1")).toBe(true);
  });
});

describe("InkProfiler", () => {
  function withFakeRaf(frameTimes: number[], run: (flush: () => void) => void) {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    run(() => {
      for (const t of frameTimes) {
        const cb = callbacks.shift();
        cb?.(t);
      }
    });
    vi.unstubAllGlobals();
  }

  test("drops the first gap, which is measured from pointerdown not a prior frame", () => {
    // Frames at 100, 120, 140: the 100 gap is down->first-frame, and the
    // real inter-frame intervals are 20 and 20.
    withFakeRaf([100, 120, 140], (flush) => {
      const profiler = new InkProfiler(7);
      profiler.begin(0);
      flush();
      const report = profiler.end(140);
      expect(report.frameCount).toBe(2);
      expect(report.frameMs.max).toBe(20);
      expect(report.longFrames).toBe(2);
    });
  });

  test("counts coalesced samples toward the true pen sample rate", () => {
    withFakeRaf([], (flush) => {
      const profiler = new InkProfiler(0);
      profiler.begin(0);
      flush();
      for (let i = 0; i < 6; i++) {
        profiler.recordMove({
          inputLatency: 2,
          handlerMs: 0.1,
          coalesced: 3,
          predicted: 0,
          pointCount: i + 1,
          pathLength: 10 * (i + 1),
        });
      }
      const report = profiler.end(1000);
      expect(report.movesPerSecond).toBeCloseTo(6);
      // 6 dispatches x 3 raw samples each.
      expect(report.samplesPerSecond).toBeCloseTo(18);
      expect(report.finalPathLength).toBe(60);
      expect(report.savedStrokes).toBe(0);
    });
  });

  test("times the repaint that follows pointerup", () => {
    withFakeRaf([100, 120], (flush) => {
      const profiler = new InkProfiler(0);
      profiler.begin(0);
      profiler.markRelease(110);
      flush();
      const report = profiler.end(120);
      // First frame after release lands at 120.
      expect(report.releaseToPaintMs).toBe(10);
    });
  });

  test("formats a report without throwing on an empty stroke", () => {
    withFakeRaf([], (flush) => {
      const profiler = new InkProfiler(0);
      profiler.begin(0);
      flush();
      expect(() => formatReport(profiler.end(1))).not.toThrow();
    });
  });
});

describe("first-move latency", () => {
  test("is reported separately from the median it would otherwise hide in", () => {
    const originalRaf = globalThis.requestAnimationFrame;
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const profiler = new InkProfiler(0);
    profiler.begin(0);
    // One slow opening event followed by prompt ones -- the shape seen
    // on device, where a long stroke's median looks healthy while the
    // start of the gesture is visibly late.
    const latencies = [38, 2, 2, 2, 2, 2, 2, 2, 2, 2];
    for (const inputLatency of latencies) {
      profiler.recordMove({
        inputLatency,
        handlerMs: 0,
        coalesced: 1,
        predicted: 0,
        pointCount: 1,
        pathLength: 1,
      });
    }
    const report = profiler.end(1000);
    expect(report.firstMoveLatency).toBe(38);
    expect(report.inputLatency.median).toBe(2);

    vi.unstubAllGlobals();
    globalThis.requestAnimationFrame = originalRaf;
  });

  test("is zero for a stroke with no moves at all", () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const profiler = new InkProfiler(0);
    profiler.begin(0);
    expect(profiler.end(1).firstMoveLatency).toBe(0);
    vi.unstubAllGlobals();
  });
});

describe("prediction reporting", () => {
  test("averages predicted points per dispatch, so an absent API reads as zero", () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const profiler = new InkProfiler(0);
    profiler.begin(0);
    for (const predicted of [4, 2, 0, 2]) {
      profiler.recordMove({
        inputLatency: 1,
        handlerMs: 0,
        coalesced: 1,
        predicted,
        pointCount: 1,
        pathLength: 1,
      });
    }
    expect(profiler.end(1000).predictedPerMove).toBe(2);

    vi.unstubAllGlobals();
  });

  test("reports zero rather than NaN when no move was recorded", () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const profiler = new InkProfiler(0);
    profiler.begin(0);
    expect(profiler.end(1).predictedPerMove).toBe(0);
    vi.unstubAllGlobals();
  });
});

describe("touchActionOverride", () => {
  test("returns null when absent, leaving the component's default in place", () => {
    expect(touchActionOverride("")).toBeNull();
    expect(touchActionOverride("?inkdebug=1")).toBeNull();
  });

  test("accepts only the two values being compared", () => {
    expect(touchActionOverride("?inktouch=none")).toBe("none");
    expect(touchActionOverride("?inktouch=pinch-zoom")).toBe("pinch-zoom");
    expect(touchActionOverride("?inktouch=manipulation")).toBeNull();
    expect(touchActionOverride("?inktouch=")).toBeNull();
  });
});
