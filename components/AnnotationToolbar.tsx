"use client";

export const PALETTE = [
  "#e63946",
  "#f3722c",
  "#f9c74f",
  "#2a9d8f",
  "#43aa8b",
  "#1d4ed8",
  "#7c3aed",
  "#111111",
];
export const MIN_WIDTH = 0.5;
export const MAX_WIDTH = 16;
export const WIDTH_STEP = 0.5;
export const DEFAULT_WIDTH = 2;

/**
 * Toolbar for pen mode: tool (pen/highlighter/eraser), color, and width
 * selection. Purely controlled — all state lives in the caller
 * (components/PdfViewer.tsx), this component only renders the given state
 * and reports changes.
 */
export default function AnnotationToolbar({
  tool,
  color,
  width,
  onToolChange,
  onColorChange,
  onWidthChange,
}: {
  tool: "pen" | "highlighter" | "eraser";
  color: string;
  width: number;
  onToolChange: (tool: "pen" | "highlighter" | "eraser") => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
}) {
  return (
    <div className="annotation-toolbar">
      <div className="annotation-toolbar-group" role="group" aria-label="工具">
        <button
          type="button"
          aria-pressed={tool === "pen"}
          className={tool === "pen" ? "annotation-toolbar-selected" : ""}
          onClick={() => onToolChange("pen")}
        >
          筆刷
        </button>
        <button
          type="button"
          aria-pressed={tool === "highlighter"}
          className={tool === "highlighter" ? "annotation-toolbar-selected" : ""}
          onClick={() => onToolChange("highlighter")}
        >
          螢光筆
        </button>
        <button
          type="button"
          aria-pressed={tool === "eraser"}
          className={tool === "eraser" ? "annotation-toolbar-selected" : ""}
          onClick={() => onToolChange("eraser")}
        >
          橡皮擦
        </button>
      </div>
      <div className="annotation-toolbar-group" role="group" aria-label="顏色">
        {PALETTE.map((paletteColor) => (
          <button
            key={paletteColor}
            type="button"
            data-testid={`color-swatch-${paletteColor}`}
            aria-label={`顏色 ${paletteColor}`}
            aria-pressed={color === paletteColor}
            className={
              "annotation-toolbar-swatch" +
              (color === paletteColor ? " annotation-toolbar-selected" : "")
            }
            style={{ backgroundColor: paletteColor }}
            onClick={() => onColorChange(paletteColor)}
          />
        ))}
        <label className="annotation-toolbar-custom-color" style={{ backgroundColor: color }}>
          自訂
          <input
            type="color"
            aria-label="自訂顏色"
            value={color}
            onChange={(event) => onColorChange(event.target.value)}
          />
        </label>
      </div>
      <div className="annotation-toolbar-group annotation-toolbar-width-group" role="group" aria-label="粗細">
        <input
          type="range"
          aria-label="筆畫粗細"
          min={MIN_WIDTH}
          max={MAX_WIDTH}
          step={WIDTH_STEP}
          value={width}
          onChange={(event) => onWidthChange(Number(event.target.value))}
        />
        <span className="annotation-toolbar-width-value">{width}px</span>
      </div>
    </div>
  );
}
