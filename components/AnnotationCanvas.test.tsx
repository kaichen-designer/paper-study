import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AnnotationCanvas from "./AnnotationCanvas";

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function setupCanvas(overrides: Partial<Parameters<typeof AnnotationCanvas>[0]> = {}) {
  const onStrokeComplete = vi.fn();
  const onEraseStroke = vi.fn();
  const baseProps = {
    width: 800,
    height: 600,
    strokes: [],
    onStrokeComplete,
    strokeColor: "#e63946",
    strokeWidth: 2,
    tool: "pen" as const,
    onEraseStroke,
    interactive: true,
    ...overrides,
  };
  const { rerender } = render(<AnnotationCanvas {...baseProps} />);
  const surface = screen.getByTestId("annotation-canvas-surface");
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
  return {
    surface,
    onStrokeComplete,
    onEraseStroke,
    rerenderWith: (next: Partial<Parameters<typeof AnnotationCanvas>[0]>) =>
      rerender(<AnnotationCanvas {...baseProps} {...next} />),
  };
}

describe("AnnotationCanvas", () => {
  it("reports a completed drag as a normalized stroke via onStrokeComplete", () => {
    const { surface, onStrokeComplete } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60 });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300 });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300 });

    expect(onStrokeComplete).toHaveBeenCalledTimes(1);
    const [strokes] = onStrokeComplete.mock.calls[0];
    expect(strokes).toHaveLength(1);
    expect(strokes[0].points[0]).toEqual({ x: 0.1, y: 0.1 });
    expect(strokes[0].points[1]).toEqual({ x: 0.5, y: 0.5 });
  });

  it("ignores a pointerdown that never completes, so a pen resting on the page saves nothing", () => {
    const { surface, onStrokeComplete } = setupCanvas();

    // Deliberate reversal of earlier behaviour: a motionless tap used to
    // be discarded to avoid stray dots, but that also dropped marks the
    // user meant to make, at random (see isCompletedMark). A press is
    // now a mark; what still saves nothing is a press with no release.
    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60 });

    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("still saves a short, fast mark even when the browser reports zero pointermove events between down and up", () => {
    const { surface, onStrokeComplete } = setupCanvas();

    // No pointermove at all — simulates writing quickly enough that the
    // whole down-to-up motion happens with no intermediate move events,
    // which used to make the stroke get discarded outright even though
    // the pointer genuinely moved.
    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 85, clientY: 63, pointerType: "pen" });

    expect(onStrokeComplete).toHaveBeenCalledTimes(1);
    const [strokes] = onStrokeComplete.mock.calls[0];
    expect(strokes[0].points).toHaveLength(2);
  });

  it("renders a full-size hit-area so touches register even when the canvas is completely empty (no strokes yet)", () => {
    setupCanvas({ strokes: [] });

    const hitArea = document.querySelector('rect[data-testid="annotation-hit-area"]');
    expect(hitArea).not.toBeNull();
    expect(hitArea?.getAttribute("width")).toBe("800");
    expect(hitArea?.getAttribute("height")).toBe("600");
  });

  it("forces pointer-events on the hit-area explicitly while interactive, rather than relying on default SVG hit-testing of an invisible fill", () => {
    setupCanvas({ strokes: [], interactive: true });

    const hitArea = document.querySelector('rect[data-testid="annotation-hit-area"]') as SVGRectElement;
    // SVG's default `visiblePainted` hit-testing is ambiguous for
    // zero-alpha fills across browsers — pointerEvents: "all" makes hit
    // detection unconditional, regardless of paint/opacity.
    expect(hitArea.style.pointerEvents).toBe("all");
  });

  it("does not force pointer-events on the hit-area while not interactive, so it can't shadow-block taps meant for the page underneath (e.g. native text selection)", () => {
    setupCanvas({ strokes: [], interactive: false });

    const hitArea = document.querySelector('rect[data-testid="annotation-hit-area"]') as SVGRectElement;
    // A child element's explicit pointer-events value overrides an
    // ancestor's `pointer-events: none` for hit-testing — so leaving this
    // hardcoded to "all" would make the whole page area untouchable
    // (blocking scroll, zoom, and text selection) even outside pen mode,
    // regardless of the parent <svg>'s own pointer-events.
    expect(hitArea.style.pointerEvents).not.toBe("all");
  });

  it("applies the currently selected strokeColor/strokeWidth to a newly drawn stroke", () => {
    const { surface, onStrokeComplete } = setupCanvas({ strokeColor: "#1d4ed8", strokeWidth: 8 });

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60 });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300 });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300 });

    const [strokes] = onStrokeComplete.mock.calls[0];
    expect(strokes[0].color).toBe("#1d4ed8");
    expect(strokes[0].width).toBe(8);
  });

  it("falls back to the default color/width when a saved stroke has neither field (pre-existing data)", () => {
    setupCanvas({
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }],
    });

    const polyline = document.querySelector("path") as SVGPathElement;
    expect(polyline.getAttribute("stroke")).toBe("#e63946");
    expect(polyline.getAttribute("stroke-width")).toBe("2");
  });

  it("renders a saved stroke's own color/width instead of the default when present", () => {
    setupCanvas({
      strokes: [
        { points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }], color: "#1d4ed8", width: 8 },
      ],
    });

    const polyline = document.querySelector("path") as SVGPathElement;
    expect(polyline.getAttribute("stroke")).toBe("#1d4ed8");
    expect(polyline.getAttribute("stroke-width")).toBe("8");
  });

  it("with the eraser tool, dragging across an existing stroke calls onEraseStroke with its index", () => {
    // horizontal stroke at normalized y=0.1 → pixel y=60, spanning x=80..720
    const { surface, onEraseStroke } = setupCanvas({
      tool: "eraser",
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }], width: 2 }],
    });

    fireEvent.pointerDown(surface, { clientX: 400, clientY: 60 });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 62 });

    expect(onEraseStroke).toHaveBeenCalledWith(0);
  });

  it("with the eraser tool, dragging never adds a new stroke via onStrokeComplete", () => {
    const { surface, onStrokeComplete } = setupCanvas({ tool: "eraser" });

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60 });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300 });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300 });

    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("with the pen tool, dragging over an existing stroke never calls onEraseStroke", () => {
    const { surface, onEraseStroke } = setupCanvas({
      tool: "pen",
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }], width: 2 }],
    });

    fireEvent.pointerDown(surface, { clientX: 400, clientY: 60 });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 62 });

    expect(onEraseStroke).not.toHaveBeenCalled();
  });

  it("renders existing strokes denormalized to the current width/height", () => {
    setupCanvas({
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }],
    });

    const path = document.querySelector("path");
    expect(path).not.toBeNull();
    expect(path?.getAttribute("d")).toBe("M 80 60 L 400 300");
  });

  it("still renders previously saved strokes when not interactive (pen mode off), so notes stay visible", () => {
    setupCanvas({
      interactive: false,
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }],
    });

    const path = document.querySelector("path");
    expect(path?.getAttribute("d")).toBe("M 80 60 L 400 300");
  });

  it("does not capture pointer input when not interactive, so scroll/zoom gestures reach the page underneath", () => {
    const { surface, onStrokeComplete } = setupCanvas({ interactive: false });

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60 });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300 });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300 });

    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("does not draw from a touch pointer (finger), so a pinch-zoom gesture isn't mistaken for a stroke", () => {
    const { surface, onStrokeComplete } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "touch" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "touch" });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerType: "touch" });

    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("still draws from a pen (Apple Pencil) pointer", () => {
    const { surface, onStrokeComplete } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerType: "pen" });

    expect(onStrokeComplete).toHaveBeenCalledTimes(1);
  });

  it("captures the pointer on pointer-down, so a fast next stroke can't lose events to a hit-test target change mid-gesture", () => {
    const { surface } = setupCanvas();
    const setPointerCapture = vi.fn();
    // jsdom doesn't implement pointer capture — attach a spy directly since
    // there's nothing to vi.spyOn an existing method on.
    (surface as unknown as { setPointerCapture: typeof setPointerCapture }).setPointerCapture =
      setPointerCapture;

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen", pointerId: 7 });

    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });

  it("does not throw when the environment has no setPointerCapture to call", () => {
    const { surface } = setupCanvas();

    expect(() =>
      fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" })
    ).not.toThrow();
  });

  it("updates the in-progress stroke's DOM element directly while drawing, without waiting for a React re-render", async () => {
    const { surface } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "pen" });
    // The write is batched to one per frame, so it lands on the next
    // frame rather than inside the event handler. Still a direct DOM
    // mutation -- no React render has happened in between.
    await nextFrame();

    const livePath = document.querySelector(
      '[data-testid="annotation-live-stroke"]'
    ) as SVGPathElement;
    expect(livePath.getAttribute("d")).toBe("M 80 60 L 400 300");
  });

  it("draws every coalesced pen sample, not just the one the browser dispatched", async () => {
    const { surface } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    // One dispatched pointermove carrying the samples the pen took
    // between frames -- these are the points a 120Hz Pencil produces
    // that never arrive as their own events.
    const move = new PointerEvent("pointermove", {
      clientX: 400,
      clientY: 300,
      pointerType: "pen",
      bubbles: true,
    });
    Object.defineProperty(move, "getCoalescedEvents", {
      value: () => [
        { clientX: 200, clientY: 150 },
        { clientX: 300, clientY: 220 },
        { clientX: 400, clientY: 300 },
      ],
    });
    fireEvent(surface, move);
    await nextFrame();

    const livePath = document.querySelector(
      '[data-testid="annotation-live-stroke"]'
    ) as SVGPathElement;
    // All three intermediate samples are in the path, not just the last.
    expect(livePath.getAttribute("d")).toContain("200");
    expect(livePath.getAttribute("d")).toContain("300 220");
  });

  it("draws a dot for a tap, instead of silently discarding it", () => {
    const { surface, onStrokeComplete } = setupCanvas();

    // A quick jab with the pencil: down and up at the same place, with
    // no movement in between. This is a mark the user meant to make --
    // a full stop, a tittle, the dot of a 點 -- not a stray touch.
    fireEvent.pointerDown(surface, { clientX: 400, clientY: 300, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerType: "pen" });

    expect(onStrokeComplete).toHaveBeenCalledTimes(1);
    const [[strokes]] = onStrokeComplete.mock.calls;
    expect(strokes[0].points).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ]);
  });

  it("captures the pointer on the drawing surface", () => {
    const capturedOn: string[] = [];
    const original = (Element.prototype as unknown as Record<string, unknown>).setPointerCapture;
    (Element.prototype as unknown as Record<string, unknown>).setPointerCapture = function (
      this: Element
    ) {
      capturedOn.push(this.getAttribute("data-testid") ?? this.tagName);
    };

    const { surface } = setupCanvas({
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }] }],
    });
    fireEvent.pointerDown(surface, { clientX: 200, clientY: 150, pointerType: "pen" });

    // Capture must land on a node that outlives the gesture. A stroke's
    // own <path> does not: it unmounts as soon as an earlier save
    // round-trips, which silently killed whatever was being drawn.
    expect(capturedOn).toEqual(["annotation-canvas-surface"]);

    (Element.prototype as unknown as Record<string, unknown>).setPointerCapture = original;
  });

  it("keeps saved ink in a separate layer that takes no pointer input at all", () => {
    const { surface } = setupCanvas({
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }] }],
    });

    const savedLayer = screen.getByTestId("annotation-saved-layer");
    // Structurally separate, so a stroke's <path> can never be the
    // pointer target -- and so rewriting the live stroke every frame
    // does not drag the saved ink through the repaint with it.
    expect(savedLayer.contains(surface)).toBe(false);
    expect(surface.contains(savedLayer)).toBe(false);
    expect(savedLayer.style.pointerEvents).toBe("none");
    expect(savedLayer.querySelectorAll("path").length).toBe(1);
  });

  it("does not let saved or pending strokes take pointer input away from the surface", () => {
    setupCanvas({ strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }] }] });

    const strokePaths = [...document.querySelectorAll("path")].filter(
      (path) => path.getAttribute("data-testid") !== "annotation-live-stroke"
    );
    expect(strokePaths.length).toBeGreaterThan(0);
    for (const path of strokePaths) {
      expect(path.style.pointerEvents).toBe("none");
    }
  });

  it("draws the browser's predicted points ahead of the pen but never saves them", async () => {
    const { surface, onStrokeComplete } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    const move = new PointerEvent("pointermove", {
      clientX: 400,
      clientY: 300,
      pointerType: "pen",
      bubbles: true,
    });
    Object.defineProperty(move, "getCoalescedEvents", {
      value: () => [{ clientX: 400, clientY: 300 }],
    });
    Object.defineProperty(move, "getPredictedEvents", {
      value: () => [{ clientX: 500, clientY: 400 }],
    });
    fireEvent(surface, move);
    await nextFrame();

    const livePath = document.querySelector(
      '[data-testid="annotation-live-stroke"]'
    ) as SVGPathElement;
    // The guess is visible, closing part of the gap to the pen tip.
    expect(livePath.getAttribute("d")).toContain("500");

    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerType: "pen" });

    // ...but the saved stroke contains only positions the pen actually
    // visited: 400/800 and 300/600, never the predicted 500/400.
    const [[strokes]] = onStrokeComplete.mock.calls;
    expect(strokes[0].points).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
    ]);
  });

  it("keeps samples taken in the frame the pen lifts, instead of truncating the stroke", () => {
    const { surface, onStrokeComplete } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "pen" });
    // No frame is allowed to run before the release, so the move is only
    // kept if pointerup flushes it synchronously. Releasing somewhere
    // else makes the difference observable: without the flush the stroke
    // would be recorded as down -> release, silently discarding where
    // the pen actually travelled.
    fireEvent.pointerUp(surface, { clientX: 640, clientY: 480, pointerType: "pen" });

    expect(onStrokeComplete).toHaveBeenCalledTimes(1);
    const [[strokes]] = onStrokeComplete.mock.calls;
    expect(strokes[0].points).toHaveLength(2);
    // 400/800, 300/600 -- the sampled move, not the 640/480 release.
    expect(strokes[0].points[1]).toEqual({ x: 0.5, y: 0.5 });
  });

  it("keeps the just-finished stroke visible immediately on pointer-up, before the parent's strokes prop has caught up (no disappear/reappear flicker while the save round-trips)", () => {
    const { surface } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerType: "pen" });

    // `strokes` prop is still [] at this point (the parent hasn't
    // persisted/echoed it back yet) — the finished stroke must still be
    // painted somewhere.
    const visiblePaths = [...document.querySelectorAll("path")].map((el) => el.getAttribute("d"));
    expect(visiblePaths).toContain("M 80 60 L 400 300");
  });

  it("drops the optimistic copy once the parent's strokes prop actually includes the saved stroke, instead of rendering it twice", () => {
    const { surface, rerenderWith } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerType: "pen" });

    rerenderWith({ strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }] });

    const matching = [...document.querySelectorAll("path")].filter(
      (el) => el.getAttribute("d") === "M 80 60 L 400 300"
    );
    expect(matching).toHaveLength(1);
  });

  it("keeps a second stroke visible when it's still pending while only the first stroke's save has round-tripped (writing quickly, one stroke per save)", () => {
    const { surface, rerenderWith } = setupCanvas();

    // First stroke.
    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerType: "pen" });

    // Second stroke, drawn immediately after — before the first stroke's
    // save has resolved and updated the `strokes` prop.
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 200, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 200, clientY: 200, pointerType: "pen" });

    // Now only the FIRST stroke's save resolves and reaches the strokes
    // prop — the second one is still in flight.
    rerenderWith({ strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }] });

    const visiblePaths = [...document.querySelectorAll("path")].map((el) => el.getAttribute("d"));
    expect(visiblePaths).toContain("M 100 100 L 200 200");
  });

  it("with the highlighter tool, drawing saves a translucent stroke", () => {
    const { surface, onStrokeComplete } = setupCanvas({ tool: "highlighter" });

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerType: "pen" });

    expect(onStrokeComplete).toHaveBeenCalledTimes(1);
    const [strokes] = onStrokeComplete.mock.calls[0];
    expect(strokes[0].opacity).toBeGreaterThan(0);
    expect(strokes[0].opacity).toBeLessThan(1);
  });

  it("with the pen tool, drawing saves a fully opaque stroke (no opacity field)", () => {
    const { surface, onStrokeComplete } = setupCanvas({ tool: "pen" });

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerType: "pen" });

    const [strokes] = onStrokeComplete.mock.calls[0];
    expect(strokes[0].opacity).toBeUndefined();
  });

  it("with the highlighter tool, dragging over an existing stroke never calls onEraseStroke (only the eraser tool erases)", () => {
    const { surface, onEraseStroke } = setupCanvas({
      tool: "highlighter",
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }], width: 2 }],
    });

    fireEvent.pointerDown(surface, { clientX: 400, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 62, pointerType: "pen" });

    expect(onEraseStroke).not.toHaveBeenCalled();
  });

  it("shows an eraser-radius cursor while erasing, so it's clear how large an area will be erased", () => {
    const { surface } = setupCanvas({ tool: "eraser", strokeWidth: 4 });

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });

    const cursor = document.querySelector('[data-testid="eraser-cursor"]') as SVGCircleElement;
    expect(cursor.getAttribute("cx")).toBe("80");
    expect(cursor.getAttribute("cy")).toBe("60");
    // ERASER_RADIUS_PX (10) + half the current stroke width (4/2 = 2).
    expect(cursor.getAttribute("r")).toBe("12");
    expect(cursor.getAttribute("opacity")).not.toBe("0");
  });

  it("moves the eraser cursor as the eraser drags", () => {
    const { surface } = setupCanvas({ tool: "eraser" });

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 150, pointerType: "pen" });

    const cursor = document.querySelector('[data-testid="eraser-cursor"]') as SVGCircleElement;
    expect(cursor.getAttribute("cx")).toBe("200");
    expect(cursor.getAttribute("cy")).toBe("150");
  });

  it("hides the eraser cursor once erasing stops", () => {
    const { surface } = setupCanvas({ tool: "eraser" });

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 80, clientY: 60, pointerType: "pen" });

    const cursor = document.querySelector('[data-testid="eraser-cursor"]') as SVGCircleElement;
    expect(cursor.getAttribute("opacity")).toBe("0");
  });

  it("does not show the eraser cursor while drawing with the pen tool", () => {
    const { surface } = setupCanvas({ tool: "pen" });

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });

    const cursor = document.querySelector('[data-testid="eraser-cursor"]') as SVGCircleElement;
    expect(cursor.getAttribute("opacity")).toBe("0");
  });

  it("renders a saved highlighter stroke with reduced stroke-opacity", () => {
    setupCanvas({
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }], opacity: 0.35 }],
    });

    const polyline = document.querySelector("path") as SVGPathElement;
    expect(polyline.getAttribute("stroke-opacity")).toBe("0.35");
  });

  it("renders a saved pen stroke (no opacity field) fully opaque", () => {
    setupCanvas({
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }],
    });

    const polyline = document.querySelector("path") as SVGPathElement;
    expect(polyline.getAttribute("stroke-opacity")).toBe("1");
  });

  it("counts a stroke the browser cancels separately from one that ended normally", () => {
    const onTally = vi.fn();
    const { surface } = setupCanvas({ onTally });

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 150, pointerType: "pen" });
    fireEvent.pointerCancel(surface, { clientX: 200, clientY: 150, pointerType: "pen" });

    const latest = onTally.mock.calls.at(-1)![0];
    // A cancelled stroke and one that never started both look like
    // "nothing appeared" to the user; only the counts tell them apart.
    expect(latest.started).toBe(1);
    expect(latest.endedByCancel).toBe(1);
    expect(latest.endedByUp).toBe(0);
  });

  it("counts a finger landing mid-stroke, which is how a palm shows up", () => {
    const onTally = vi.fn();
    const { surface } = setupCanvas({ onTally });

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerDown(surface, { clientX: 300, clientY: 400, pointerType: "touch" });

    const latest = onTally.mock.calls.at(-1)![0];
    expect(latest.touchWhileDrawing).toBe(1);
    // The touch must not be mistaken for a second stroke.
    expect(latest.started).toBe(1);
  });

  it("does not count a finger that lands while no stroke is in progress", () => {
    const onTally = vi.fn();
    const { surface } = setupCanvas({ onTally });

    fireEvent.pointerDown(surface, { clientX: 300, clientY: 400, pointerType: "touch" });

    const latest = onTally.mock.calls.at(-1);
    expect(latest?.[0].touchWhileDrawing ?? 0).toBe(0);
  });

  type Recorded = { op: string; args: number[] };

  function stubCanvas() {
    const calls: Recorded[] = [];
    const record = (op: string) => (...args: number[]) => calls.push({ op, args });
    const context = {
      setTransform: record("setTransform"),
      clearRect: record("clearRect"),
      beginPath: record("beginPath"),
      moveTo: record("moveTo"),
      quadraticCurveTo: record("quadraticCurveTo"),
      stroke: record("stroke"),
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "",
      lineJoin: "",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    return { calls, context };
  }

  function penMove(surface: Element, x: number, y: number) {
    const move = new PointerEvent("pointermove", {
      clientX: x,
      clientY: y,
      pointerType: "pen",
      bubbles: true,
    });
    Object.defineProperty(move, "getCoalescedEvents", {
      value: () => [{ clientX: x, clientY: y }],
    });
    fireEvent(surface, move);
  }

  it("paints settled segments onto the canvas and leaves only a short tail in SVG", async () => {
    const { calls } = stubCanvas();
    const { surface } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 0, clientY: 0, pointerType: "pen" });
    penMove(surface, 100, 0);
    penMove(surface, 200, 0);
    penMove(surface, 300, 0);
    await nextFrame();

    const curves = calls.filter((call) => call.op === "quadraticCurveTo");
    // Points 0..3: the curves through points 1 and 2 are final once the
    // next point exists, so both are painted; point 3 is still moving.
    expect(curves).toHaveLength(2);

    const livePath = document.querySelector(
      '[data-testid="annotation-live-stroke"]'
    ) as SVGPathElement;
    // The tail is the settled end plus the current point -- two points,
    // however long the stroke gets. That bounded box is the entire point
    // of moving the stroke off SVG. The settled end is the midpoint
    // between points 2 and 3, since the curve through point 2 ends there.
    expect(livePath.getAttribute("d")).toBe("M 250 0 L 300 0");

    vi.restoreAllMocks();
  });

  it("does not repaint settled segments as the stroke grows", async () => {
    const { calls } = stubCanvas();
    const { surface } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 0, clientY: 0, pointerType: "pen" });
    penMove(surface, 100, 0);
    penMove(surface, 200, 0);
    await nextFrame();
    const afterFirst = calls.filter((c) => c.op === "quadraticCurveTo").length;

    penMove(surface, 300, 0);
    penMove(surface, 400, 0);
    await nextFrame();
    const afterSecond = calls.filter((c) => c.op === "quadraticCurveTo").length;

    // Two more points, two more curves -- not a redraw of everything so
    // far. Cost per frame stays flat instead of growing with the stroke.
    expect(afterSecond - afterFirst).toBe(2);

    vi.restoreAllMocks();
  });

  it("clears the canvas when a stroke ends, so it cannot bleed into the next one", async () => {
    const { calls } = stubCanvas();
    const { surface } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 0, clientY: 0, pointerType: "pen" });
    penMove(surface, 100, 50);
    await nextFrame();
    calls.length = 0;

    fireEvent.pointerUp(surface, { clientX: 100, clientY: 50, pointerType: "pen" });

    expect(calls.some((call) => call.op === "clearRect")).toBe(true);
    vi.restoreAllMocks();
  });

  it("still draws when no canvas context is available, rather than losing the stroke", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { surface } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    penMove(surface, 400, 300);
    await nextFrame();

    const livePath = document.querySelector(
      '[data-testid="annotation-live-stroke"]'
    ) as SVGPathElement;
    // Falls back to the whole path in SVG: slower, but it draws.
    expect(livePath.getAttribute("d")).toBe("M 80 60 L 400 300");

    vi.restoreAllMocks();
  });

  it("does not re-render saved ink while a stroke is in progress", () => {
    const { surface, rerenderWith } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerType: "pen" });

    const savedLayer = screen.getByTestId("annotation-saved-layer");
    expect(savedLayer.querySelectorAll("path")).toHaveLength(0);

    // An earlier stroke's save lands while the pen is still down. Taking
    // it on now would re-render every stroke on the page mid-gesture,
    // and that cost grows as the page fills.
    rerenderWith({ strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }] });

    expect(savedLayer.querySelectorAll("path")).toHaveLength(0);
  });

  it("takes on ink that arrived mid-stroke once the pen lifts", () => {
    const { surface, rerenderWith } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerType: "pen" });
    rerenderWith({ strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }] });
    fireEvent.pointerUp(surface, { clientX: 20, clientY: 20, pointerType: "pen" });

    // Deferred, not dropped. The lift also leaves this gesture's own
    // optimistic mark behind, so look for the deferred stroke itself
    // rather than counting paths.
    const drawn = [...screen.getByTestId("annotation-saved-layer").querySelectorAll("path")].map(
      (path) => path.getAttribute("d")
    );
    expect(drawn).toContain("M 80 60 L 400 300");
  });

  it("does not report the render count on every render, which would be a render loop", () => {
    const onTally = vi.fn();
    const { surface, rerenderWith } = setupCanvas({ onTally });

    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerType: "pen" });
    const afterStart = onTally.mock.calls.length;

    // Renders arriving mid-stroke must be counted silently. Reporting
    // sets state in the parent, which renders, which counts again.
    rerenderWith({ strokeColor: "#000000" });
    rerenderWith({ strokeColor: "#111111" });
    rerenderWith({ strokeColor: "#222222" });

    expect(onTally.mock.calls.length).toBe(afterStart);

    // The count still reaches the parent, once the stroke ends.
    fireEvent.pointerUp(surface, { clientX: 20, clientY: 20, pointerType: "pen" });
    expect(onTally.mock.calls.at(-1)![0].rendersDuringStroke).toBeGreaterThan(0);
  });
});
