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
