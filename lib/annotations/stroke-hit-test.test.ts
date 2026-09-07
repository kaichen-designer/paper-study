import { describe, expect, it } from "vitest";
import { doesEraserPathIntersectStroke } from "./stroke-hit-test";
import type { Stroke } from "./queries";

// All test strokes use the same horizontal segment from (0, 0.5) to (1, 0.5)
// so the perpendicular distance from any point (x, 0.5 + d) to the segment
// is simply |d|, as long as 0 <= x <= 1 (so the closest point on the segment
// is the interior projection, not an endpoint).

describe("doesEraserPathIntersectStroke", () => {
  it("returns true when the eraser path passes close to a stroke segment", () => {
    const stroke: Stroke = {
      points: [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
      width: 0.02,
    };
    // perpendicular distance from (0.5, 0.525) to the segment is 0.025
    const eraserPoints = [{ x: 0.5, y: 0.525 }];
    const eraserRadius = 0.02;
    // threshold = eraserRadius + width/2 = 0.02 + 0.01 = 0.03, distance 0.025 < 0.03

    expect(doesEraserPathIntersectStroke(eraserPoints, stroke, eraserRadius)).toBe(true);
  });

  it("returns false when the eraser path stays far away from the stroke", () => {
    const stroke: Stroke = {
      points: [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
      width: 0.02,
    };
    // perpendicular distance from (0.5, 1.0) to the segment is 0.5
    const eraserPoints = [{ x: 0.5, y: 1.0 }];
    const eraserRadius = 0.02;
    // threshold = eraserRadius + width/2 = 0.02 + 0.01 = 0.03, distance 0.5 >> 0.03

    expect(doesEraserPathIntersectStroke(eraserPoints, stroke, eraserRadius)).toBe(false);
  });

  it("misses a thin stroke but hits a wide stroke at the same distance, eraser path, and radius", () => {
    // perpendicular distance from (0.5, 0.56) to the segment is 0.06
    const eraserPoints = [{ x: 0.5, y: 0.56 }];
    const eraserRadius = 0.02;

    const thinStroke: Stroke = {
      points: [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
      width: 0.02, // threshold = 0.02 + 0.01 = 0.03 < 0.06 distance
    };
    const wideStroke: Stroke = {
      points: [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
      width: 0.12, // threshold = 0.02 + 0.06 = 0.08 >= 0.06 distance
    };

    expect(doesEraserPathIntersectStroke(eraserPoints, thinStroke, eraserRadius)).toBe(false);
    expect(doesEraserPathIntersectStroke(eraserPoints, wideStroke, eraserRadius)).toBe(true);
  });
});
