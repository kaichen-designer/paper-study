import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AnnotationToolbar, { PALETTE, WIDTHS } from "./AnnotationToolbar";

function setup(overrides: Partial<Parameters<typeof AnnotationToolbar>[0]> = {}) {
  const onToolChange = vi.fn();
  const onColorChange = vi.fn();
  const onWidthChange = vi.fn();
  render(
    <AnnotationToolbar
      tool="pen"
      color={PALETTE[0]}
      width={WIDTHS[1]}
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

  it("marks the currently selected tool button with aria-pressed=true, and the other false", () => {
    setup({ tool: "eraser" });

    expect(screen.getByRole("button", { name: "筆刷" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "橡皮擦" })).toHaveAttribute("aria-pressed", "true");
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

  it("calls onWidthChange with the clicked width option", () => {
    const { onWidthChange } = setup();

    screen.getByTestId(`width-option-${WIDTHS[2]}`).click();

    expect(onWidthChange).toHaveBeenCalledWith(WIDTHS[2]);
  });

  it("marks the currently selected width option with aria-pressed=true", () => {
    setup({ width: WIDTHS[0] });

    expect(screen.getByTestId(`width-option-${WIDTHS[0]}`)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByTestId(`width-option-${WIDTHS[1]}`)).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});
