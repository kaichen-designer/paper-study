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

/**
 * Paints a stored stroke onto a 2D context at the page's current pixel
 * size, using the same quadratic-midpoint smoothing as
 * smoothPathFromPoints so canvas and SVG rendering agree.
 *
 * Saved ink is drawn here rather than as SVG paths because a page's
 * worth of <path> elements is re-rasterized whenever the layer is
 * invalidated -- measured at roughly 17ms a frame with ~40 strokes,
 * which scales with how much has been drawn. A bitmap costs the same
 * whatever it holds.
 */
export function paintStroke(
  context: {
    beginPath: () => void;
    moveTo: (x: number, y: number) => void;
    lineTo: (x: number, y: number) => void;
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => void;
    stroke: () => void;
  },
  points: { x: number; y: number }[],
  pageWidth: number,
  pageHeight: number
): void {
  if (points.length === 0) return;
  const pixels = points.map((point) => denormalizePoint(point, pageWidth, pageHeight));

  context.beginPath();
  context.moveTo(pixels[0].x, pixels[0].y);

  if (pixels.length === 1) {
    // A tap. The round line cap turns a zero-length line into a dot.
    context.lineTo(pixels[0].x, pixels[0].y);
    context.stroke();
    return;
  }

  for (let i = 1; i < pixels.length - 1; i++) {
    const midX = (pixels[i].x + pixels[i + 1].x) / 2;
    const midY = (pixels[i].y + pixels[i + 1].y) / 2;
    context.quadraticCurveTo(pixels[i].x, pixels[i].y, midX, midY);
  }
  const last = pixels[pixels.length - 1];
  context.lineTo(last.x, last.y);
  context.stroke();
}
