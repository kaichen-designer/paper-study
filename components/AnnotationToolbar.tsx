"use client";

export const PALETTE = ["#e63946", "#1d4ed8", "#111111", "#2a9d8f"];
export const WIDTHS = [2, 4, 8];

/**
 * Toolbar for pen mode: tool (pen/eraser), color, and width selection.
 * Purely controlled — all state lives in the caller (components/PdfViewer.tsx),
 * this component only renders the given state and reports clicks.
 */
export default function AnnotationToolbar({
  tool,
  color,
  width,
  onToolChange,
  onColorChange,
  onWidthChange,
}: {
  tool: "pen" | "eraser";
  color: string;
  width: number;
  onToolChange: (tool: "pen" | "eraser") => void;
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
      </div>
      <div className="annotation-toolbar-group" role="group" aria-label="粗細">
        {WIDTHS.map((widthOption) => (
          <button
            key={widthOption}
            type="button"
            data-testid={`width-option-${widthOption}`}
            aria-label={`粗細 ${widthOption}`}
            aria-pressed={width === widthOption}
            className={
              "annotation-toolbar-width" +
              (width === widthOption ? " annotation-toolbar-selected" : "")
            }
            onClick={() => onWidthChange(widthOption)}
          >
            <span style={{ height: widthOption }} />
          </button>
        ))}
      </div>
    </div>
  );
}
