import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AnnotationCanvas from "./AnnotationCanvas";

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

  it("does not call onStrokeComplete for a tap with no movement", () => {
    const { surface, onStrokeComplete } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60 });
    fireEvent.pointerUp(surface, { clientX: 80, clientY: 60 });

    expect(onStrokeComplete).not.toHaveBeenCalled();
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

    const polyline = document.querySelector("polyline") as SVGPolylineElement;
    expect(polyline.getAttribute("stroke")).toBe("#e63946");
    expect(polyline.getAttribute("stroke-width")).toBe("2");
  });

  it("renders a saved stroke's own color/width instead of the default when present", () => {
    setupCanvas({
      strokes: [
        { points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }], color: "#1d4ed8", width: 8 },
      ],
    });

    const polyline = document.querySelector("polyline") as SVGPolylineElement;
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

    const polyline = document.querySelector("polyline");
    expect(polyline).not.toBeNull();
    expect(polyline?.getAttribute("points")).toBe("80,60 400,300");
  });

  it("still renders previously saved strokes when not interactive (pen mode off), so notes stay visible", () => {
    setupCanvas({
      interactive: false,
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }],
    });

    const polyline = document.querySelector("polyline");
    expect(polyline?.getAttribute("points")).toBe("80,60 400,300");
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

  it("updates the in-progress stroke's DOM element directly while drawing, without waiting for a React re-render", () => {
    const { surface } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "pen" });

    const livePolyline = document.querySelector(
      '[data-testid="annotation-live-stroke"]'
    ) as SVGPolylineElement;
    expect(livePolyline.getAttribute("points")).toBe("80,60 400,300");
  });

  it("keeps the just-finished stroke visible immediately on pointer-up, before the parent's strokes prop has caught up (no disappear/reappear flicker while the save round-trips)", () => {
    const { surface } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerType: "pen" });

    // `strokes` prop is still [] at this point (the parent hasn't
    // persisted/echoed it back yet) — the finished stroke must still be
    // painted somewhere.
    const visiblePoints = [...document.querySelectorAll("polyline")].map((el) =>
      el.getAttribute("points")
    );
    expect(visiblePoints).toContain("80,60 400,300");
  });

  it("drops the optimistic copy once the parent's strokes prop actually includes the saved stroke, instead of rendering it twice", () => {
    const { surface, rerenderWith } = setupCanvas();

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 60, pointerType: "pen" });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 300, pointerType: "pen" });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 300, pointerType: "pen" });

    rerenderWith({ strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }] });

    const matching = [...document.querySelectorAll("polyline")].filter(
      (el) => el.getAttribute("points") === "80,60 400,300"
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

    const visiblePoints = [...document.querySelectorAll("polyline")].map((el) =>
      el.getAttribute("points")
    );
    expect(visiblePoints).toContain("100,100 200,200");
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

  it("renders a saved highlighter stroke with reduced stroke-opacity", () => {
    setupCanvas({
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }], opacity: 0.35 }],
    });

    const polyline = document.querySelector("polyline") as SVGPolylineElement;
    expect(polyline.getAttribute("stroke-opacity")).toBe("0.35");
  });

  it("renders a saved pen stroke (no opacity field) fully opaque", () => {
    setupCanvas({
      strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }],
    });

    const polyline = document.querySelector("polyline") as SVGPolylineElement;
    expect(polyline.getAttribute("stroke-opacity")).toBe("1");
  });
});
