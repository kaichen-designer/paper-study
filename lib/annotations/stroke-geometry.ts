export type Point = { x: number; y: number; pressure?: number };

/**
 * Converts a pixel coordinate (measured against the page's rendered size
 * at draw time) into a 0~1 coordinate relative to that page size. Stored
 * this way so a stroke stays aligned with the page content regardless of
 * what size the page happens to render at later (different device,
 * different zoom) — see design.md's normalization decision.
 */
export function normalizePoint(
  pixel: { x: number; y: number },
  pageWidth: number,
  pageHeight: number
): { x: number; y: number } {
  return { x: pixel.x / pageWidth, y: pixel.y / pageHeight };
}

/**
 * Inverse of normalizePoint: converts a stored 0~1 coordinate back into a
 * pixel coordinate for the page's current rendered size.
 */
export function denormalizePoint(
  normalized: { x: number; y: number },
  pageWidth: number,
  pageHeight: number
): { x: number; y: number } {
  return { x: normalized.x * pageWidth, y: normalized.y * pageHeight };
}

/**
 * Builds an SVG path `d` string that curves smoothly through a sequence of
 * raw sampled points, instead of connecting them with straight segments
 * (a plain polyline visibly kinks at every sample point, which looks
 * faceted/angular rather than like natural handwriting). Each interior
 * point becomes a quadratic curve's control point, with the curve's actual
 * endpoint at the midpoint between it and the next point — a standard
 * technique for smoothing freehand point sequences.
 */
export function smoothPathFromPoints(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}
