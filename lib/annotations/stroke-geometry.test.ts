import { describe, expect, it } from "vitest";
import {
  denormalizePoint,
  paintStroke,
  normalizePoint,
  smoothPathFromPoints,
} from "./stroke-geometry";

describe("normalizePoint / denormalizePoint", () => {
  it.each([
    {
      pixel: { x: 400, y: 300 },
      drawSize: { width: 800, height: 600 },
      normalized: { x: 0.5, y: 0.5 },
      redrawSize: { width: 600, height: 450 },
      redrawPixel: { x: 300, y: 225 },
    },
    {
      pixel: { x: 80, y: 60 },
      drawSize: { width: 800, height: 600 },
      normalized: { x: 0.1, y: 0.1 },
      redrawSize: { width: 1000, height: 750 },
      redrawPixel: { x: 100, y: 75 },
    },
  ])(
    "normalizes $pixel at $drawSize to $normalized, and denormalizes to $redrawPixel at $redrawSize",
    ({ pixel, drawSize, normalized, redrawSize, redrawPixel }) => {
      const result = normalizePoint(pixel, drawSize.width, drawSize.height);
      expect(result.x).toBeCloseTo(normalized.x);
      expect(result.y).toBeCloseTo(normalized.y);

      const redrawn = denormalizePoint(result, redrawSize.width, redrawSize.height);
      expect(redrawn.x).toBeCloseTo(redrawPixel.x);
      expect(redrawn.y).toBeCloseTo(redrawPixel.y);
    }
  );

  it("round-trips through normalize then denormalize at the same page size without drift", () => {
    const original = { x: 123, y: 456 };
    const normalized = normalizePoint(original, 800, 600);
    const restored = denormalizePoint(normalized, 800, 600);

    expect(restored.x).toBeCloseTo(original.x);
    expect(restored.y).toBeCloseTo(original.y);
  });
});

describe("smoothPathFromPoints", () => {
  it("returns an empty string for no points", () => {
    expect(smoothPathFromPoints([])).toBe("");
  });

  it("moves to the single point without drawing anything, for a single-point stroke", () => {
    expect(smoothPathFromPoints([{ x: 5, y: 10 }])).toBe("M 5 10");
  });

  it("draws a straight line for exactly two points", () => {
    expect(smoothPathFromPoints([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toBe("M 0 0 L 10 20");
  });

  it("draws quadratic curves through the midpoints of each segment, ending exactly at the last point", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ];
    // Each interior point is a curve control point, curving toward the
    // midpoint of it and the next point — this is what keeps the line from
    // having a sharp angle exactly at each raw sampled point.
    expect(smoothPathFromPoints(points)).toBe(
      "M 0 0 Q 10 0 15 5 Q 20 10 25 10 L 30 10"
    );
  });
});

describe("paintStroke", () => {
  function recorder() {
    const ops: string[] = [];
    const push = (op: string) => (...args: number[]) => ops.push(op + "(" + args.join(",") + ")");
    return {
      ops,
      context: {
        beginPath: push("beginPath"),
        moveTo: push("moveTo"),
        lineTo: push("lineTo"),
        quadraticCurveTo: push("quadraticCurveTo"),
        stroke: push("stroke"),
      },
    };
  }

  it("draws nothing for an empty stroke", () => {
    const { ops, context } = recorder();
    paintStroke(context, [], 800, 600);
    expect(ops).toEqual([]);
  });

  it("draws a single point as a dot, which the round cap renders", () => {
    const { ops, context } = recorder();
    paintStroke(context, [{ x: 0.5, y: 0.5 }], 800, 600);
    expect(ops).toEqual([
      "beginPath()",
      "moveTo(400,300)",
      "lineTo(400,300)",
      "stroke()",
    ]);
  });

  it("matches smoothPathFromPoints, so canvas and SVG agree", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0.5 },
    ];
    const { ops, context } = recorder();
    paintStroke(context, points, 100, 100);

    // Same control points and midpoints as the SVG path builder.
    expect(smoothPathFromPoints(points.map((p) => denormalizePoint(p, 100, 100)))).toBe(
      "M 0 0 Q 50 0 75 25 L 100 50"
    );
    expect(ops).toEqual([
      "beginPath()",
      "moveTo(0,0)",
      "quadraticCurveTo(50,0,75,25)",
      "lineTo(100,50)",
      "stroke()",
    ]);
  });
});
