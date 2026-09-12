"use client";

import { useRef } from "react";
import { denormalizePoint, normalizePoint, type Point } from "@/lib/annotations/stroke-geometry";
import type { Stroke } from "@/lib/annotations/queries";
import { doesEraserPathIntersectStroke } from "@/lib/annotations/stroke-hit-test";

// Strokes saved before color/width support existed have neither field —
// render them the same way they always looked, rather than requiring a
// data backfill.
const DEFAULT_STROKE_COLOR = "#e63946";
const DEFAULT_STROKE_WIDTH = 2;

// Radius (in pixels of the currently rendered page) added to a stroke's own
// half-width when deciding whether the eraser path reaches it — gives the
// eraser some forgiveness beyond the exact line geometry.
const ERASER_RADIUS_PX = 10;

function pointsAttribute(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Overlays a drawable surface on a PDF page. Always mounted (so previously
 * saved strokes stay visible even outside pen mode) — `interactive`, not
 * mounting, controls whether it captures pointer input at all, so it never
 * blocks scrolling/zooming the underlying page while pen mode is off.
 *
 * Only `pointerType === "pen"` (Apple Pencil) draws. Finger (`"touch"`)
 * input is deliberately ignored rather than prevented, so a two-finger
 * pinch-zoom reaches the browser's native gesture handling instead of
 * being captured as a scribbled stroke.
 *
 * The in-progress stroke is rendered by mutating a polyline DOM node
 * directly (via ref) instead of through React state — going through
 * setState + re-render on every pointermove added enough latency to make
 * fast handwriting visibly lag behind the physical pen.
 */
export default function AnnotationCanvas({
  width,
  height,
  strokes,
  onStrokeComplete,
  strokeColor,
  strokeWidth,
  tool,
  onEraseStroke,
  interactive,
}: {
  width: number;
  height: number;
  strokes: Stroke[];
  onStrokeComplete: (strokes: Stroke[]) => void;
  strokeColor: string;
  strokeWidth: number;
  tool: "pen" | "eraser";
  onEraseStroke: (index: number) => void;
  interactive: boolean;
}) {
  const drawingPointsRef = useRef<Point[]>([]);
  const surfaceRef = useRef<SVGSVGElement>(null);
  const liveStrokeRef = useRef<SVGPolylineElement>(null);

  function toLocalPoint(event: { clientX: number; clientY: number }): Point {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (!interactive || event.pointerType === "touch") return;

    // Belt-and-suspenders alongside the `touch-action` CSS: some WebKit
    // versions still let a nested scrollable ancestor (the
    // .pdf-viewer-page container has overflow: auto) hijack the gesture
    // as a scroll/pan unless the pointerdown itself is also prevented.
    event.preventDefault();
    const point = toLocalPoint(event);
    drawingPointsRef.current = [point];
    liveStrokeRef.current?.setAttribute("points", pointsAttribute(drawingPointsRef.current));
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!interactive || event.pointerType === "touch") return;
    if (drawingPointsRef.current.length === 0) return;
    event.preventDefault();
    const localPoint = toLocalPoint(event);

    if (tool === "eraser") {
      strokes.forEach((stroke, index) => {
        const pixelStroke: Stroke = {
          points: stroke.points.map((point) => denormalizePoint(point, width, height)),
          width: stroke.width,
        };
        if (doesEraserPathIntersectStroke([localPoint], pixelStroke, ERASER_RADIUS_PX)) {
          onEraseStroke(index);
        }
      });
      drawingPointsRef.current = [...drawingPointsRef.current, localPoint];
      return;
    }

    drawingPointsRef.current = [...drawingPointsRef.current, localPoint];
    liveStrokeRef.current?.setAttribute("points", pointsAttribute(drawingPointsRef.current));
  }

  function finishDrawing() {
    if (tool === "pen" && drawingPointsRef.current.length > 1) {
      const normalized = drawingPointsRef.current.map((point) =>
        normalizePoint(point, width, height)
      );
      onStrokeComplete([{ points: normalized, color: strokeColor, width: strokeWidth }]);
    }
    drawingPointsRef.current = [];
    liveStrokeRef.current?.setAttribute("points", "");
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (event.pointerType === "touch") return;
    finishDrawing();
  }

  function toPolylinePoints(stroke: Stroke): string {
    return stroke.points
      .map((point) => {
        const pixel = denormalizePoint(point, width, height);
        return `${pixel.x},${pixel.y}`;
      })
      .join(" ");
  }

  return (
    <svg
      ref={surfaceRef}
      data-testid="annotation-canvas-surface"
      width={width}
      height={height}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={finishDrawing}
      style={{
        touchAction: interactive ? "pinch-zoom" : "auto",
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      {/*
        SVG's default `pointer-events: visiblePainted` hit-tests based on
        whether fill/stroke would actually paint a pixel — a rect with a
        zero-alpha fill is ambiguous across browsers under that rule, so
        drawing on an empty canvas can silently fail to register any
        pointer events at all. `pointerEvents: "all"` here makes hit
        detection unconditional (geometry only, ignores paint/opacity),
        guaranteeing the whole surface is touchable even before any
        stroke exists. Only takes effect while `interactive` (the parent
        svg falls back to `pointerEvents: "none"` otherwise).
      */}
      <rect
        data-testid="annotation-hit-area"
        x={0}
        y={0}
        width={width}
        height={height}
        fill="transparent"
        style={{ pointerEvents: "all" }}
      />
      {strokes.map((stroke, index) => (
        <polyline
          key={index}
          points={toPolylinePoints(stroke)}
          fill="none"
          stroke={stroke.color ?? DEFAULT_STROKE_COLOR}
          strokeWidth={stroke.width ?? DEFAULT_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <polyline
        ref={liveStrokeRef}
        data-testid="annotation-live-stroke"
        points=""
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
