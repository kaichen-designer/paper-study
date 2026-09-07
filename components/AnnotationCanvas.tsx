"use client";

import { useRef, useState } from "react";
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

/**
 * Overlays a drawable surface on a PDF page. Always captures pointer input
 * while mounted — components/PdfViewer.tsx controls whether this is
 * mounted at all (pen mode toggle), rather than this component tracking
 * its own enabled/disabled state.
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
}: {
  width: number;
  height: number;
  strokes: Stroke[];
  onStrokeComplete: (strokes: Stroke[]) => void;
  strokeColor: string;
  strokeWidth: number;
  tool: "pen" | "eraser";
  onEraseStroke: (index: number) => void;
}) {
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const surfaceRef = useRef<SVGSVGElement>(null);

  function toLocalPoint(event: { clientX: number; clientY: number }): Point {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: React.PointerEvent) {
    // Belt-and-suspenders alongside the `touch-action: none` CSS: some
    // WebKit versions still let a nested scrollable ancestor (the
    // .pdf-viewer-page container has overflow: auto) hijack the gesture
    // as a scroll/pan unless the pointerdown itself is also prevented.
    event.preventDefault();
    setDrawingPoints([toLocalPoint(event)]);
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (drawingPoints.length === 0) return;
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
      setDrawingPoints((points) => [...points, localPoint]);
      return;
    }

    setDrawingPoints((points) => [...points, localPoint]);
  }

  function handlePointerUp() {
    if (tool === "pen" && drawingPoints.length > 1) {
      const normalized = drawingPoints.map((point) => normalizePoint(point, width, height));
      onStrokeComplete([{ points: normalized, color: strokeColor, width: strokeWidth }]);
    }
    setDrawingPoints([]);
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
      onPointerCancel={() => setDrawingPoints([])}
      style={{ touchAction: "none", pointerEvents: "auto" }}
    >
      {/*
        SVG's default `pointer-events: visiblePainted` hit-tests based on
        whether fill/stroke would actually paint a pixel — a rect with a
        zero-alpha fill is ambiguous across browsers under that rule, so
        drawing on an empty canvas can silently fail to register any
        pointer events at all. `pointerEvents: "all"` here makes hit
        detection unconditional (geometry only, ignores paint/opacity),
        guaranteeing the whole surface is touchable even before any
        stroke exists.
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
      {tool === "pen" && drawingPoints.length > 1 && (
        <polyline
          points={drawingPoints.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
