import { describe, expect, it } from "vitest";
import { denormalizePoint, normalizePoint } from "./stroke-geometry";

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
