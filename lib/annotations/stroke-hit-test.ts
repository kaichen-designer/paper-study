import type { Point } from "./stroke-geometry";
import type { Stroke } from "./queries";

/** Matches the default stroke width used elsewhere for old data without a width field. */
const DEFAULT_STROKE_WIDTH = 2;

/**
 * Shortest distance from point `p` to the line segment `a`-`b`. Projects `p`
 * onto the (clamped) segment rather than just comparing to the endpoints, so
 * a point that lands beside the middle of a long segment is measured
 * correctly instead of only against its nearest endpoint.
 */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)
  );

  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;

  return Math.hypot(p.x - closestX, p.y - closestY);
}

/**
 * Whether an eraser drag (sampled as `eraserPoints`, each acting as the
 * center of a circle of radius `eraserRadius`) comes within reach of any
 * segment of `stroke`. A fast drag has sparse sample points, so this checks
 * distance to each line segment between consecutive stroke points — not
 * just distance to the stroke's sampled points — to avoid gaps.
 */
export function doesEraserPathIntersectStroke(
  eraserPoints: Point[],
  stroke: Stroke,
  eraserRadius: number
): boolean {
  const { points } = stroke;
  if (points.length === 0) {
    return false;
  }

  const strokeWidth = stroke.width ?? DEFAULT_STROKE_WIDTH;
  const threshold = eraserRadius + strokeWidth / 2;

  for (const eraserPoint of eraserPoints) {
    if (points.length === 1) {
      if (Math.hypot(eraserPoint.x - points[0].x, eraserPoint.y - points[0].y) <= threshold) {
        return true;
      }
      continue;
    }

    for (let i = 0; i < points.length - 1; i++) {
      if (distanceToSegment(eraserPoint, points[i], points[i + 1]) <= threshold) {
        return true;
      }
    }
  }

  return false;
}
