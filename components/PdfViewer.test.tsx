import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {}, version: "test" },
  Document: ({
    children,
    onLoadSuccess,
  }: {
    children: React.ReactNode;
    onLoadSuccess: (result: { numPages: number; getPage: () => void }) => void;
  }) => {
    onLoadSuccess({ numPages: 3, getPage: vi.fn() });
    return <div data-testid="document">{children}</div>;
  },
  Page: ({
    pageNumber,
    width,
    onLoadSuccess,
  }: {
    pageNumber: number;
    width?: number;
    onLoadSuccess?: (page: {
      getTextContent: () => Promise<{ items: { str: string }[] }>;
      getViewport: (params: { scale: number }) => { width: number; height: number };
    }) => void;
  }) => {
    onLoadSuccess?.({
      getTextContent: async () => ({
        items: [{ str: `頁面 ${pageNumber} 的文字` }],
      }),
      getViewport: () => ({ width: 600, height: 800 }),
    });
    return (
      <div data-testid="page" data-width={width ?? ""}>
        頁面 {pageNumber}
      </div>
    );
  },
}));

vi.mock("./AnnotationCanvas", () => ({
  default: ({
    tool,
    strokeColor,
    strokeWidth,
    onEraseStroke,
    interactive,
  }: {
    tool?: string;
    strokeColor?: string;
    strokeWidth?: number;
    onEraseStroke?: (index: number) => void;
    interactive?: boolean;
  }) => (
    <div
      data-testid="annotation-canvas"
      data-tool={tool}
      data-stroke-color={strokeColor}
      data-stroke-width={strokeWidth}
      data-interactive={interactive}
    >
      <button type="button" onClick={() => onEraseStroke?.(0)}>
        simulate-erase-stroke-0
      </button>
    </div>
  ),
}));

import PdfViewer from "./PdfViewer";

describe("PdfViewer", () => {
  it("renders the first page by default once the document loads", () => {
    render(<PdfViewer fileUrl="/papers/example.pdf" />);
    expect(screen.getByTestId("page")).toHaveTextContent("頁面 1");
  });

  it("renders page N+1 after clicking next, when there are more than N pages", () => {
    render(<PdfViewer fileUrl="/papers/example.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: /下一頁/ }));
    expect(screen.getByTestId("page")).toHaveTextContent("頁面 2");
  });

  it("does not advance past the last loaded page", () => {
    render(<PdfViewer fileUrl="/papers/example.pdf" />);
    const nextButton = screen.getByRole("button", { name: /下一頁/ });
    fireEvent.click(nextButton);
    fireEvent.click(nextButton);
    fireEvent.click(nextButton);
    fireEvent.click(nextButton);
    expect(screen.getByTestId("page")).toHaveTextContent("頁面 3");
  });

  it("goes back to the previous page", () => {
    render(<PdfViewer fileUrl="/papers/example.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: /下一頁/ }));
    fireEvent.click(screen.getByRole("button", { name: /上一頁/ }));
    expect(screen.getByTestId("page")).toHaveTextContent("頁面 1");
  });

  it("reports the current page via onPageChange whenever it changes", () => {
    const onPageChange = vi.fn();
    render(<PdfViewer fileUrl="/papers/example.pdf" onPageChange={onPageChange} />);

    expect(onPageChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: /下一頁/ }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onReachedLastPage once navigation reaches the last page", () => {
    const onReachedLastPage = vi.fn();
    render(<PdfViewer fileUrl="/papers/example.pdf" onReachedLastPage={onReachedLastPage} />);

    const nextButton = screen.getByRole("button", { name: /下一頁/ });
    fireEvent.click(nextButton);
    fireEvent.click(nextButton);

    expect(onReachedLastPage).toHaveBeenCalled();
  });

  it("does not call onReachedLastPage on initial render when not on the last page", () => {
    const onReachedLastPage = vi.fn();
    render(<PdfViewer fileUrl="/papers/example.pdf" onReachedLastPage={onReachedLastPage} />);

    expect(onReachedLastPage).not.toHaveBeenCalled();
  });

  it("scales the rendered page to fit the container's width, so it never overflows and needs horizontal scrolling", () => {
    const clientWidthSpy = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(480);

    render(<PdfViewer fileUrl="/papers/example.pdf" />);

    expect(screen.getByTestId("page")).toHaveAttribute("data-width", "480");
    clientWidthSpy.mockRestore();
  });

  it("reports the current page's full text via onPageTextLoaded once the page loads", async () => {
    const onPageTextLoaded = vi.fn();
    render(<PdfViewer fileUrl="/papers/example.pdf" onPageTextLoaded={onPageTextLoaded} />);

    await waitFor(() => expect(onPageTextLoaded).toHaveBeenCalledWith("頁面 1 的文字"));
  });

  it("reports the user's text selection via onTextSelected when selection changes inside the viewer", () => {
    const onTextSelected = vi.fn();
    render(<PdfViewer fileUrl="/papers/example.pdf" onTextSelected={onTextSelected} />);

    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "selected excerpt",
      anchorNode: screen.getByTestId("document"),
      isCollapsed: false,
    } as unknown as Selection);

    fireEvent(document, new Event("selectionchange"));

    expect(onTextSelected).toHaveBeenCalledWith("selected excerpt");
    getSelectionSpy.mockRestore();
  });

  it("reports the loaded PDF document object via onDocumentLoad, for full-text extraction", () => {
    const onDocumentLoad = vi.fn();
    render(<PdfViewer fileUrl="/papers/example.pdf" onDocumentLoad={onDocumentLoad} />);

    expect(onDocumentLoad).toHaveBeenCalled();
    const [doc] = onDocumentLoad.mock.calls[0];
    expect(doc.numPages).toBe(3);
    expect(typeof doc.getPage).toBe("function");
  });

  it("keeps the annotation canvas mounted even before pen mode is toggled on, so saved notes stay visible while reading", () => {
    render(<PdfViewer fileUrl="/papers/example.pdf" />);
    expect(screen.getByTestId("annotation-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("annotation-canvas")).toHaveAttribute("data-interactive", "false");
  });

  it("marks the annotation canvas interactive when pen mode is toggled on, and not interactive when toggled back off", () => {
    render(<PdfViewer fileUrl="/papers/example.pdf" />);
    const toggle = screen.getByRole("button", { name: /畫筆模式/ });

    fireEvent.click(toggle);
    expect(screen.getByTestId("annotation-canvas")).toHaveAttribute("data-interactive", "true");

    fireEvent.click(toggle);
    expect(screen.getByTestId("annotation-canvas")).toHaveAttribute("data-interactive", "false");
  });

  it("visibly indicates when pen mode is active, so the drawable area is discoverable", () => {
    render(<PdfViewer fileUrl="/papers/example.pdf" />);
    const toggle = screen.getByRole("button", { name: /畫筆模式/ });

    expect(screen.getByTestId("page").closest(".pdf-viewer-page")).not.toHaveClass(
      "pen-mode-active"
    );

    fireEvent.click(toggle);
    expect(screen.getByTestId("page").closest(".pdf-viewer-page")).toHaveClass(
      "pen-mode-active"
    );
  });

  it("stacks the annotation canvas above pdf.js's own text/annotation layers (z-index 2/3), so touches land on it instead of falling through to text selection or page scroll", () => {
    render(<PdfViewer fileUrl="/papers/example.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: /畫筆模式/ }));

    const canvas = screen.getByTestId("annotation-canvas");
    expect(canvas.parentElement).toHaveStyle({ zIndex: 10 });
  });

  it("does not render the annotation toolbar until pen mode is toggled on", () => {
    render(<PdfViewer fileUrl="/papers/example.pdf" />);
    expect(screen.queryByRole("group", { name: "工具" })).not.toBeInTheDocument();
  });

  it("mounts the annotation toolbar when pen mode is on, and passes the selected color/width down to AnnotationCanvas", () => {
    render(<PdfViewer fileUrl="/papers/example.pdf" />);
    fireEvent.click(screen.getByRole("button", { name: /畫筆模式/ }));

    expect(screen.getByRole("group", { name: "工具" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("color-swatch-#1d4ed8"));

    expect(screen.getByTestId("annotation-canvas")).toHaveAttribute(
      "data-stroke-color",
      "#1d4ed8"
    );
  });

  it("resets the toolbar's selected tool back to pen each time pen mode is re-entered, even after switching to eraser", () => {
    render(<PdfViewer fileUrl="/papers/example.pdf" />);
    const penModeToggle = screen.getByRole("button", { name: /畫筆模式/ });

    fireEvent.click(penModeToggle);
    fireEvent.click(screen.getByRole("button", { name: "橡皮擦" }));
    expect(screen.getByTestId("annotation-canvas")).toHaveAttribute("data-tool", "eraser");

    fireEvent.click(penModeToggle); // turn pen mode off
    fireEvent.click(penModeToggle); // turn pen mode back on

    expect(screen.getByTestId("annotation-canvas")).toHaveAttribute("data-tool", "pen");
  });

  it("forwards an erased stroke's index from AnnotationCanvas to PdfViewer's own onEraseStroke prop", () => {
    const onEraseStroke = vi.fn();
    render(<PdfViewer fileUrl="/papers/example.pdf" onEraseStroke={onEraseStroke} />);
    fireEvent.click(screen.getByRole("button", { name: /畫筆模式/ }));

    fireEvent.click(screen.getByRole("button", { name: "simulate-erase-stroke-0" }));

    expect(onEraseStroke).toHaveBeenCalledWith(0);
  });

  it("does not report text selections while pen mode is on", () => {
    const onTextSelected = vi.fn();
    render(<PdfViewer fileUrl="/papers/example.pdf" onTextSelected={onTextSelected} />);

    fireEvent.click(screen.getByRole("button", { name: /畫筆模式/ }));

    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "selected excerpt",
      anchorNode: screen.getByTestId("document"),
      isCollapsed: false,
    } as unknown as Selection);

    fireEvent(document, new Event("selectionchange"));

    expect(onTextSelected).not.toHaveBeenCalled();
    getSelectionSpy.mockRestore();
  });
});
