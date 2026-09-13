import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AnnotationToolbar, {
  PALETTE,
  MIN_WIDTH,
  MAX_WIDTH,
  DEFAULT_WIDTH,
} from "./AnnotationToolbar";

function setup(overrides: Partial<Parameters<typeof AnnotationToolbar>[0]> = {}) {
  const onToolChange = vi.fn();
  const onColorChange = vi.fn();
  const onWidthChange = vi.fn();
  render(
    <AnnotationToolbar
      tool="pen"
      color={PALETTE[0]}
      width={DEFAULT_WIDTH}
      onToolChange={onToolChange}
      onColorChange={onColorChange}
      onWidthChange={onWidthChange}
      {...overrides}
    />
  );
  return { onToolChange, onColorChange, onWidthChange };
}

describe("AnnotationToolbar", () => {
  it("calls onToolChange with 'eraser' when the eraser button is clicked", () => {
    const { onToolChange } = setup();

    screen.getByRole("button", { name: "橡皮擦" }).click();

    expect(onToolChange).toHaveBeenCalledWith("eraser");
  });

  it("calls onToolChange with 'pen' when the pen button is clicked", () => {
    const { onToolChange } = setup({ tool: "eraser" });

    screen.getByRole("button", { name: "筆刷" }).click();

    expect(onToolChange).toHaveBeenCalledWith("pen");
  });

  it("calls onToolChange with 'highlighter' when the highlighter button is clicked", () => {
    const { onToolChange } = setup();

    screen.getByRole("button", { name: "螢光筆" }).click();

    expect(onToolChange).toHaveBeenCalledWith("highlighter");
  });

  it("marks the currently selected tool button with aria-pressed=true, and the others false", () => {
    setup({ tool: "highlighter" });

    expect(screen.getByRole("button", { name: "筆刷" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "螢光筆" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "橡皮擦" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onColorChange with the clicked palette color", () => {
    const { onColorChange } = setup();

    screen.getByTestId(`color-swatch-${PALETTE[2]}`).click();

    expect(onColorChange).toHaveBeenCalledWith(PALETTE[2]);
  });

  it("marks the currently selected color swatch with aria-pressed=true", () => {
    setup({ color: PALETTE[1] });

    expect(screen.getByTestId(`color-swatch-${PALETTE[1]}`)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByTestId(`color-swatch-${PALETTE[0]}`)).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("offers a custom color picker, for colors outside the preset palette", () => {
    const { onColorChange } = setup();

    fireEvent.change(screen.getByLabelText("自訂顏色"), { target: { value: "#ff00aa" } });

    expect(onColorChange).toHaveBeenCalledWith("#ff00aa");
  });

  it("exposes a continuous width slider from MIN_WIDTH to MAX_WIDTH", () => {
    setup();

    const slider = screen.getByLabelText("筆畫粗細") as HTMLInputElement;
    expect(slider.min).toBe(String(MIN_WIDTH));
    expect(slider.max).toBe(String(MAX_WIDTH));
  });

  it("calls onWidthChange with the slider's new numeric value", () => {
    const { onWidthChange } = setup();

    fireEvent.change(screen.getByLabelText("筆畫粗細"), { target: { value: "5.5" } });

    expect(onWidthChange).toHaveBeenCalledWith(5.5);
  });

  it("reflects the current width as the slider's value", () => {
    setup({ width: 7 });

    expect(screen.getByLabelText("筆畫粗細")).toHaveValue("7");
  });
});
