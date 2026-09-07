import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AnnotationCanvas from "./AnnotationCanvas";

function setupCanvas(overrides: Partial<Parameters<typeof AnnotationCanvas>[0]> = {}) {
  const onStrokeComplete = vi.fn();
  const onEraseStroke = vi.fn();
  render(
    <AnnotationCanvas
      width={800}
      height={600}
      strokes={[]}
      onStrokeComplete={onStrokeComplete}
      strokeColor="#e63946"
      strokeWidth={2}
      tool="pen"
      onEraseStroke={onEraseStroke}
      {...overrides}
    />
  );
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
  return { surface, onStrokeComplete, onEraseStroke };
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

  it("forces pointer-events on the hit-area explicitly, rather than relying on default SVG hit-testing of an invisible fill", () => {
    setupCanvas({ strokes: [] });

    const hitArea = document.querySelector('rect[data-testid="annotation-hit-area"]') as SVGRectElement;
    // SVG's default `visiblePainted` hit-testing is ambiguous for
    // zero-alpha fills across browsers — pointerEvents: "all" makes hit
    // detection unconditional, regardless of paint/opacity.
    expect(hitArea.style.pointerEvents).toBe("all");
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
});
