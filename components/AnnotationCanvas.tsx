"use client";

import { useEffect, useRef, useState } from "react";
import {
  cachedStrokePath,
  denormalizePoint,
  normalizePoint,
  smoothPathFromPoints,
  type Point,
} from "@/lib/annotations/stroke-geometry";
import type { Stroke } from "@/lib/annotations/queries";
import { doesEraserPathIntersectStroke } from "@/lib/annotations/stroke-hit-test";
import {
  InkProfiler,
  emptyTally,
  inkDebugEnabled,
  type InkTally,
  type StrokeReport,
} from "@/lib/annotations/ink-profiler";

// Strokes saved before color/width support existed have neither field —
// render them the same way they always looked, rather than requiring a
// data backfill.
const DEFAULT_STROKE_COLOR = "#e63946";
const DEFAULT_STROKE_WIDTH = 2;
const DEFAULT_STROKE_OPACITY = 1;

// Translucent enough that highlighted text stays readable underneath, but
// still clearly visible as a highlight.
const HIGHLIGHTER_OPACITY = 0.35;

// Radius (in pixels of the currently rendered page) added to a stroke's own
// half-width when deciding whether the eraser path reaches it — gives the
// eraser some forgiveness beyond the exact line geometry.
const ERASER_RADIUS_PX = 10;

// A completed press-and-release is a mark, whether or not the pen moved
// between the two.
//
// This previously also required the points to DIFFER, to avoid saving a
// motionless tap. In practice that discarded marks the user meant to
// make: whether a quick jab registers even one pixel of travel is close
// to a coin flip, so the same gesture was sometimes drawn and sometimes
// silently dropped. Intermittent disappearing strokes are far worse than
// an occasional unintended dot, and a tap leaving a dot is what a pen is
// expected to do. Rendered as a dot by the round linecap on a zero
// length path.
function isCompletedMark(points: Point[]): boolean {
  return points.length >= 2;
}

// Compares by geometry only (not color/width) — a stroke's points are its
// real identity here; two genuinely different strokes sharing the exact
// same point sequence is vanishingly unlikely.
function strokesEqual(a: Stroke, b: Stroke): boolean {
  if (a.points.length !== b.points.length) return false;
  return a.points.every((point, index) => point.x === b.points[index].x && point.y === b.points[index].y);
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
 *
 * A just-finished stroke is kept in `pendingStrokes` (optimistic, rendered
 * like any other saved stroke) until the `strokes` prop actually reflects
 * it — `onStrokeComplete` triggers an async save in the parent, and without
 * this the stroke would flash empty for however long that round-trip takes
 * (the live-preview polyline clears immediately on pointer-up, but the
 * "real" strokes.map() render doesn't have it yet either). Writing quickly
 * queues up more than one pending stroke before any single save resolves,
 * so reconciliation only drops the specific stroke(s) that have actually
 * appeared in `strokes` — clearing the whole buffer on any props change
 * would also wipe out sibling strokes still mid-save.
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
  onProfileReport,
  onTally,
}: {
  width: number;
  height: number;
  strokes: Stroke[];
  onStrokeComplete: (strokes: Stroke[]) => void;
  strokeColor: string;
  strokeWidth: number;
  tool: "pen" | "highlighter" | "eraser";
  onEraseStroke: (index: number) => void;
  interactive: boolean;
  // Diagnostic only, opt-in via ?inkdebug=1 — see lib/annotations/ink-profiler.ts.
  onProfileReport?: (report: StrokeReport) => void;
  onTally?: (tally: InkTally) => void;
}) {
  const drawingPointsRef = useRef<Point[]>([]);
  // Client coordinates sampled since the last frame, still unconverted.
  const pendingRawRef = useRef<{ clientX: number; clientY: number }[]>([]);
  const flushHandleRef = useRef<number | null>(null);
  const surfaceRef = useRef<SVGSVGElement>(null);
  const liveStrokeRef = useRef<SVGPathElement>(null);
  const eraserCursorRef = useRef<SVGCircleElement>(null);
  const [pendingStrokes, setPendingStrokes] = useState<Stroke[]>([]);
  const profilerRef = useRef<InkProfiler | null>(null);
  // Points the browser guesses the pen is about to reach. Rendered at the
  // end of the live stroke and thrown away on the next frame -- they are
  // never appended to drawingPointsRef, so nothing speculative is saved.
  const predictedRef = useRef<Point[]>([]);
  const tallyRef = useRef<InkTally>(emptyTally());

  function bumpTally(field: keyof InkTally) {
    tallyRef.current = { ...tallyRef.current, [field]: tallyRef.current[field] + 1 };
    onTally?.(tallyRef.current);
  }

  // Drop only the pending strokes that have actually appeared in the
  // parent's `strokes` prop — not the whole buffer, since other strokes
  // drawn in quick succession may still be mid-save.
  useEffect(() => {
    setPendingStrokes((current) =>
      current.filter((pending) => !strokes.some((saved) => strokesEqual(pending, saved)))
    );
  }, [strokes]);

  useEffect(() => {
    return () => {
      if (flushHandleRef.current !== null) cancelAnimationFrame(flushHandleRef.current);
    };
  }, []);

  /**
   * Appends everything sampled since the last frame and rewrites the live
   * stroke's `d` once. Both halves belong here rather than in the event
   * handler: reading the surface rect forces a style/layout flush, and a
   * pen dispatching several coalesced batches per frame would otherwise
   * pay for both the layout and a full path rebuild on every one of them,
   * only for all but the last result to be overwritten before anything is
   * painted.
   */
  function flushLiveStroke() {
    flushHandleRef.current = null;
    const pending = pendingRawRef.current;
    if (pending.length === 0) return;
    pendingRawRef.current = [];
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    for (const raw of pending) {
      drawingPointsRef.current.push({ x: raw.clientX - rect.left, y: raw.clientY - rect.top });
    }
    // The predicted tail is drawn but not recorded: it closes part of the
    // gap between the pen tip and the ink, and is replaced by real
    // samples on the very next frame. Guessed points must never reach
    // drawingPointsRef, or a saved stroke would contain positions the pen
    // never visited.
    const predicted = predictedRef.current;
    const toDraw =
      predicted.length > 0
        ? [...drawingPointsRef.current, ...predicted]
        : drawingPointsRef.current;
    liveStrokeRef.current?.setAttribute("d", smoothPathFromPoints(toDraw));
  }

  function scheduleFlush() {
    if (flushHandleRef.current !== null) return;
    flushHandleRef.current = requestAnimationFrame(flushLiveStroke);
  }

  function toLocalPoint(event: { clientX: number; clientY: number }): Point {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function showEraserCursor(point: Point) {
    const cursor = eraserCursorRef.current;
    if (!cursor) return;
    cursor.setAttribute("cx", String(point.x));
    cursor.setAttribute("cy", String(point.y));
    cursor.setAttribute("opacity", "1");
  }

  function hideEraserCursor() {
    eraserCursorRef.current?.setAttribute("opacity", "0");
  }

  // Shared by pointermove and pointerup — a fast enough down-then-up with
  // NO intermediate pointermove events (a short tap-like mark, common when
  // writing quickly) used to be silently dropped, because only
  // pointermove ever appended to drawingPointsRef; pointerup never
  // recorded its own position. Routing pointerup through this too means
  // even a zero-move stroke still ends up with a real (down, up) pair.
  function recordPoint(localPoint: Point) {
    if (tool === "eraser") {
      showEraserCursor(localPoint);
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
    liveStrokeRef.current?.setAttribute("d", smoothPathFromPoints(drawingPointsRef.current));
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (!interactive) return;
    if (event.pointerType === "touch") {
      // A palm landing mid-stroke is the classic way a pen gesture gets
      // taken away; counting them is how we tell that apart from a
      // stroke that never started.
      if (drawingPointsRef.current.length > 0) bumpTally("touchWhileDrawing");
      return;
    }
    bumpTally("started");

    // Belt-and-suspenders alongside the `touch-action` CSS: some WebKit
    // versions still let a nested scrollable ancestor (the
    // .pdf-viewer-page container has overflow: auto) hijack the gesture
    // as a scroll/pan unless the pointerdown itself is also prevented.
    event.preventDefault();

    // Capture on the surface, NOT on event.target. The target is whatever
    // element the pen happened to land on, which on a page with existing
    // annotations is usually one of their <path> nodes — and those
    // unmount as soon as a previous stroke's save round-trips and the
    // pending buffer is reconciled. Capturing on a node that is about to
    // disappear hands the rest of the gesture to nobody: the stroke being
    // drawn right now simply stops, which reads as the canvas randomly
    // refusing to draw. The surface outlives every stroke.
    try {
      surfaceRef.current?.setPointerCapture?.(event.pointerId);
    } catch {
      // Safe to ignore — capture is a reliability improvement, not a
      // requirement; drawing still works without it.
    }

    if (inkDebugEnabled(window.location.search)) {
      profilerRef.current = new InkProfiler(strokes.length);
      profilerRef.current.begin(performance.now());
    }

    const point = toLocalPoint(event);
    drawingPointsRef.current = [point];
    if (tool === "eraser") {
      showEraserCursor(point);
    } else {
      liveStrokeRef.current?.setAttribute("d", smoothPathFromPoints(drawingPointsRef.current));
    }
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!interactive || event.pointerType === "touch") return;
    if (drawingPointsRef.current.length === 0) return;
    event.preventDefault();

    const profiler = profilerRef.current;
    const handlerStart = profiler ? performance.now() : 0;
    const native = event.nativeEvent as PointerEvent & {
      getCoalescedEvents?: () => PointerEvent[];
      getPredictedEvents?: () => PointerEvent[];
    };

    if (tool === "eraser") {
      // Left synchronous and uncoalesced on purpose: erasing is already
      // smooth, and the hit test wants the pointer's current position,
      // not a replay of every sample leading up to it.
      recordPoint(toLocalPoint(event));
    } else {
      // Apple Pencil samples at 120-240Hz, but pointermove is dispatched
      // at most once per frame and the samples in between are reachable
      // only through getCoalescedEvents -- ignoring it throws away more
      // than half the pen's resolution, which is what makes quick
      // handwriting come out angular.
      const coalesced = native.getCoalescedEvents?.() ?? [];
      const batch = coalesced.length > 0 ? coalesced : [event];
      for (const sample of batch) {
        pendingRawRef.current.push({ clientX: sample.clientX, clientY: sample.clientY });
      }

      // Where the browser thinks the pen is heading. Drawing this tail is
      // how a native pen app hides the two frames a touchscreen pipeline
      // costs; without it the ink can only ever trail the tip.
      const rect = surfaceRef.current?.getBoundingClientRect();
      const guesses = native.getPredictedEvents?.() ?? [];
      predictedRef.current =
        rect && guesses.length > 0
          ? guesses.map((guess) => ({
              x: guess.clientX - rect.left,
              y: guess.clientY - rect.top,
            }))
          : [];

      scheduleFlush();
    }

    if (profiler) {
      profiler.recordMove({
        // event.timeStamp shares performance.now()'s origin in every
        // browser that matters here, so the difference is how long the
        // event sat before our handler ran.
        inputLatency: handlerStart - event.timeStamp,
        // Sampling only -- the path rebuild now happens in the
        // once-per-frame flush, and shows up in frameMs instead.
        handlerMs: performance.now() - handlerStart,
        coalesced: native.getCoalescedEvents?.().length ?? 1,
        predicted: predictedRef.current.length,
        pointCount: drawingPointsRef.current.length + pendingRawRef.current.length,
        pathLength: liveStrokeRef.current?.getAttribute("d")?.length ?? 0,
      });
    }
  }

  function finishDrawing() {
    if (flushHandleRef.current !== null) {
      cancelAnimationFrame(flushHandleRef.current);
      flushHandleRef.current = null;
    }
    // Samples taken during the current frame have not been appended yet,
    // and dropping them would shorten every stroke by up to one frame.
    flushLiveStroke();

    if ((tool === "pen" || tool === "highlighter") && isCompletedMark(drawingPointsRef.current)) {
      const normalized = drawingPointsRef.current.map((point) =>
        normalizePoint(point, width, height)
      );
      const stroke: Stroke = {
        points: normalized,
        color: strokeColor,
        width: strokeWidth,
        ...(tool === "highlighter" ? { opacity: HIGHLIGHTER_OPACITY } : {}),
      };
      setPendingStrokes((current) => [...current, stroke]);
      onStrokeComplete([stroke]);
    }
    if (
      (tool === "pen" || tool === "highlighter") &&
      drawingPointsRef.current.length > 0 &&
      !isCompletedMark(drawingPointsRef.current)
    ) {
      bumpTally("discarded");
    }

    drawingPointsRef.current = [];
    pendingRawRef.current = [];
    predictedRef.current = [];
    liveStrokeRef.current?.setAttribute("d", "");
    hideEraserCursor();

    const profiler = profilerRef.current;
    if (profiler) {
      profilerRef.current = null;
      profiler.markRelease(performance.now());
      // Two frames: the first carries the repaint triggered by the
      // release, the second guarantees it has been observed before the
      // rAF loop is torn down.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => onProfileReport?.(profiler.end(performance.now())))
      );
    }
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (event.pointerType === "touch") return;
    if (drawingPointsRef.current.length > 0) bumpTally("endedByUp");
    // Only pointerdown fired for this stroke, with zero pointermoves in
    // between (a very fast, short mark) — record the release position too,
    // so it isn't discarded outright for having just a single point.
    // When pointermove already ran, its last position is where the finger/
    // pencil actually was, so there's nothing new to add here.
    flushLiveStroke();
    if (drawingPointsRef.current.length === 1) {
      recordPoint(toLocalPoint(event));
    }
    finishDrawing();
  }

  function toSmoothPath(stroke: Stroke): string {
    return cachedStrokePath(stroke, width, height);
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
      onPointerCancel={() => {
        // The browser took the gesture away mid-stroke. Whatever ink was
        // drawn is still the user's, so it is kept rather than dropped --
        // but the event is counted, because a stroke that dies this way
        // is indistinguishable from one that never worked.
        if (drawingPointsRef.current.length > 0) bumpTally("endedByCancel");
        finishDrawing();
      }}
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
        stroke exists.

        This MUST stay conditional on `interactive`, matching the parent
        <svg> — an explicit pointer-events value on a child overrides an
        ancestor's `pointer-events: none` for hit-testing, so a hardcoded
        "all" here would make this invisible rect swallow every touch over
        the whole page (blocking scroll/zoom/native text selection) even
        while not interactive, regardless of what the parent svg sets.
      */}
      <rect
        data-testid="annotation-hit-area"
        x={0}
        y={0}
        width={width}
        height={height}
        fill="transparent"
        style={{ pointerEvents: interactive ? "all" : "none" }}
      />
      {strokes.map((stroke, index) => (
        <path
          key={`saved-${index}`}
          d={toSmoothPath(stroke)}
          // Ink is not a control. Leaving these hit-testable let them
          // become the pointerdown target (see handlePointerDown), and
          // made WebKit test every painted segment on the page against
          // every pointer event.
          style={{ pointerEvents: "none" }}
          fill="none"
          stroke={stroke.color ?? DEFAULT_STROKE_COLOR}
          strokeWidth={stroke.width ?? DEFAULT_STROKE_WIDTH}
          strokeOpacity={stroke.opacity ?? DEFAULT_STROKE_OPACITY}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {pendingStrokes.map((stroke, index) => (
        <path
          key={`pending-${index}`}
          d={toSmoothPath(stroke)}
          style={{ pointerEvents: "none" }}
          fill="none"
          stroke={stroke.color ?? DEFAULT_STROKE_COLOR}
          strokeWidth={stroke.width ?? DEFAULT_STROKE_WIDTH}
          strokeOpacity={stroke.opacity ?? DEFAULT_STROKE_OPACITY}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <path
        ref={liveStrokeRef}
        data-testid="annotation-live-stroke"
        d=""
        style={{ pointerEvents: "none" }}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={tool === "highlighter" ? HIGHLIGHTER_OPACITY : DEFAULT_STROKE_OPACITY}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/*
        Visual guide for how large an area the eraser reaches — matches
        doesEraserPathIntersectStroke's own threshold (lib/annotations/
        stroke-hit-test.ts): ERASER_RADIUS_PX plus half the *current* pen
        width as a stand-in for whatever width the strokes on the page were
        actually drawn with (not knowable in advance — this is an
        approximation, not an exact per-stroke reach). Hidden (opacity 0)
        except while actively erasing.
      */}
      <circle
        ref={eraserCursorRef}
        data-testid="eraser-cursor"
        cx={0}
        cy={0}
        r={ERASER_RADIUS_PX + strokeWidth / 2}
        fill="none"
        stroke={DEFAULT_STROKE_COLOR}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        opacity={0}
        pointerEvents="none"
      />
    </svg>
  );
}
