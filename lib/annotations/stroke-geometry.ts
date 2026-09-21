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

// Keyed on the stroke object itself, so a stroke whose identity survives
// a re-render is never re-serialized. Entries disappear with the stroke,
// hence WeakMap rather than a Map that would pin every stroke a reader
// has ever scrolled past.
const strokePathCache = new WeakMap<object, { width: number; height: number; d: string }>();

/**
 * Denormalizes a stored stroke to the page's current pixel size and
 * builds its smoothed path, reusing the previous result when the same
 * stroke is asked for again at the same size.
 *
 * Every saved stroke on the page was otherwise re-serialized on every
 * React render, including the render caused by finishing an unrelated
 * stroke -- so the cost of lifting the pen grew with how much was
 * already drawn on the page.
 *
 * Callers MUST treat a stroke as immutable: the cache is keyed on object
 * identity and will not notice points being mutated in place.
 */
export function cachedStrokePath(
  stroke: { points: { x: number; y: number }[] },
  pageWidth: number,
  pageHeight: number
): string {
  const cached = strokePathCache.get(stroke);
  if (cached && cached.width === pageWidth && cached.height === pageHeight) {
    return cached.d;
  }
  const d = smoothPathFromPoints(
    stroke.points.map((point) => denormalizePoint(point, pageWidth, pageHeight))
  );
  strokePathCache.set(stroke, { width: pageWidth, height: pageHeight, d });
  return d;
}
