"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { canGoNext, canGoPrevious, clampPage, nextPage, previousPage } from "@/lib/pdf/pagination";
import { getSelectionText } from "@/lib/pdf/selection-text";
import { expandToSentence } from "@/lib/pdf/sentence-selection";
import AnnotationCanvas from "./AnnotationCanvas";
import { formatReport, inkDebugEnabled, type StrokeReport } from "@/lib/annotations/ink-profiler";
import AnnotationToolbar, { PALETTE, DEFAULT_WIDTH } from "./AnnotationToolbar";
import type { Stroke } from "@/lib/annotations/queries";
import type { PdfDocumentProxy } from "@/lib/pdf/extract-full-text";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Text inputs stay selectable under this; see globals.css.
const DRAWING_BODY_CLASS = "pen-mode-drawing";

const DEFAULT_ASPECT_RATIO = 1.414; // A4 fallback until the real page loads

export default function PdfViewer({
  fileUrl,
  onTextSelected,
  onPageChange,
  onReachedLastPage,
  onPageTextLoaded,
  strokes,
  onStrokeComplete,
  onEraseStroke,
  onDocumentLoad,
}: {
  fileUrl: string;
  onTextSelected?: (text: string) => void;
  onPageChange?: (page: number) => void;
  onReachedLastPage?: () => void;
  onPageTextLoaded?: (text: string) => void;
  strokes?: Stroke[];
  onStrokeComplete?: (strokes: Stroke[]) => void;
  onEraseStroke?: (index: number) => void;
  onDocumentLoad?: (pdf: PdfDocumentProxy) => void;
}) {
  const [numPages, setNumPages] = useState(1);
  const [documentLoaded, setDocumentLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageWidth, setPageWidth] = useState<number | undefined>(undefined);
  const [pageAspectRatio, setPageAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const [penMode, setPenMode] = useState(false);
  const [tool, setTool] = useState<"pen" | "highlighter" | "eraser">("pen");
  const [strokeColor, setStrokeColor] = useState(PALETTE[0]);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_WIDTH);
  const [hasActiveSelection, setHasActiveSelection] = useState(false);
  // Diagnostic only, opt-in via ?inkdebug=1 — see lib/annotations/ink-profiler.ts.
  const [inkReport, setInkReport] = useState<StrokeReport | null>(null);
  const inkDebug = typeof window !== "undefined" && inkDebugEnabled(window.location.search);

  // A stylus drag over the PDF text layer is a text-selection gesture as
  // far as WebKit is concerned, and it will take the gesture outright:
  // the stroke never reaches the canvas and text highlights instead.
  // preventDefault() on pointerdown does not reliably stop this on iOS,
  // so refuse the selection itself. Only while drawing -- selecting text
  // is how translation is invoked the rest of the time.
  //
  // Refusing new selections is not enough on its own. Once a selection
  // exists on screen iOS gives it drag handles, and a pen landing near
  // one moves that handle instead of starting a fresh gesture -- so a
  // single stray selection keeps eating strokes until it is dismissed,
  // no matter how fast or slow the writing is. Clear it on entering pen
  // mode and again as each stroke begins.
  useEffect(() => {
    // Bound to the document, not to any container. Scoping this to the
    // page left the toolbar selectable; scoping it to the viewer left
    // the translation panel selectable, which lives outside PdfViewer
    // entirely. Chasing the selection outward one ancestor at a time was
    // the wrong shape of fix: pen mode is a mode, not a widget, and
    // while it is on nothing on screen should be selectable.
    if (!penMode) return;

    const dropSelection = () => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
    };

    const refuse = (event: Event) => event.preventDefault();

    dropSelection();
    document.body.classList.add(DRAWING_BODY_CLASS);
    document.addEventListener("selectstart", refuse);
    // Capture phase: get ahead of anything that would act on a lingering
    // selection before the stroke has a chance to start.
    document.addEventListener("pointerdown", dropSelection, true);
    return () => {
      document.body.classList.remove(DRAWING_BODY_CLASS);
      document.removeEventListener("selectstart", refuse);
      document.removeEventListener("pointerdown", dropSelection, true);
    };
  }, [penMode]);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageWrapperRef = useRef<HTMLDivElement>(null);

  // Falls back to a sensible default width so the annotation canvas can
  // still mount even before the container's real width has been measured
  // (e.g. the very first paint, or in a test environment without layout).
  const effectivePageWidth = pageWidth || 800;
  const pageHeight = effectivePageWidth * pageAspectRatio;

  useEffect(() => {
    onPageChange?.(clampPage(currentPage, numPages));
  }, [currentPage, numPages, onPageChange]);

  useEffect(() => {
    // `numPages` defaults to 1 as a placeholder before the real PDF has
    // loaded (see useState above) — without the documentLoaded guard, the
    // very first render (currentPage=1, placeholder numPages=1) would
    // trivially satisfy "on the last page" before the actual page count
    // is known, firing this for every single-page-or-more document.
    if (documentLoaded && numPages > 0 && clampPage(currentPage, numPages) === numPages) {
      onReachedLastPage?.();
    }
  }, [documentLoaded, currentPage, numPages, onReachedLastPage]);

  useEffect(() => {
    // Fit the rendered page to its container's width so it never overflows
    // and forces horizontal scrolling on narrower screens (e.g. iPad).
    function updateWidth() {
      if (pageWrapperRef.current) {
        setPageWidth(pageWrapperRef.current.clientWidth);
      }
    }

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    // Toolbar selections do not persist across pen-mode sessions — every
    // time the user re-enters pen mode, start from the pen tool and the
    // default color/width rather than remembering the last session's pick.
    if (penMode) {
      setTool("pen");
      setStrokeColor(PALETTE[0]);
      setStrokeWidth(DEFAULT_WIDTH);
    }
  }, [penMode]);

  useEffect(() => {
    if (!onTextSelected) return;
    // Pen mode owns pointer/selection input on the page while active — skip
    // reporting text selections so the two interaction modes never clash.
    if (penMode) return;

    function handleSelectionChange() {
      const selection = window.getSelection();
      const anchorNode = selection?.anchorNode;
      const withinViewer = !!anchorNode && !!containerRef.current?.contains(anchorNode);

      // Experimental: iOS Safari's drag-to-extend selection handles compete
      // with .pdf-viewer-page's own overflow:auto scrolling for the same
      // drag gesture, so extending a selection can get misread as a page
      // scroll instead. Suspending scroll while a real selection is active
      // removes that competition — at the cost of not being able to scroll
      // until the selection is cleared.
      setHasActiveSelection(!!selection && !selection.isCollapsed && withinViewer);

      if (!selection || selection.isCollapsed) return;
      if (!withinViewer) return;

      // Not `selection.toString()`: pdf.js renders each text run as its own
      // absolutely-positioned span with no guaranteed whitespace between
      // runs, so the raw browser selection string can fuse words together
      // at line breaks/run boundaries — see lib/pdf/selection-text.ts.
      const range = selection.getRangeAt(0);
      const text = getSelectionText(range, containerRef.current!);
      if (text) {
        onTextSelected!(text);
      }
    }

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      setHasActiveSelection(false);
    };
  }, [onTextSelected, penMode]);

  // A single tap (not a drag) selects the whole sentence under it, as an
  // alternative to dragging a precise range on pdf.js's tightly-packed
  // text layer — imprecise on a touchscreen and easy to over/under-select.
  // Only acts when the tap didn't already leave behind a real (non-
  // collapsed) selection, so this never fights a genuine drag-selection.
  function handleClick(event: React.MouseEvent) {
    if (!onTextSelected || penMode) return;

    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;

    const caretRange = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    const caretNode = caretRange?.startContainer;
    if (!caretRange || !caretNode || caretNode.nodeType !== Node.TEXT_NODE) return;
    if (!containerRef.current?.contains(caretNode)) return;

    const sentenceRange = expandToSentence(
      containerRef.current,
      caretNode as Text,
      caretRange.startOffset
    );
    if (!sentenceRange) return;

    selection?.removeAllRanges();
    selection?.addRange(sentenceRange);

    const text = getSelectionText(sentenceRange, containerRef.current);
    if (text) {
      onTextSelected(text);
    }
  }

  // pdf.js's real TextContent.items is (TextItem | TextMarkedContent)[] —
  // only TextItem has `str`, so this is deliberately untyped at the
  // boundary and reads the field defensively at runtime instead of trying
  // to model pdf.js's full type surface. Same for getViewport's return
  // shape — only `.width`/`.height` are read.
  async function handlePageLoadSuccess(page: {
    getTextContent: () => Promise<unknown>;
    getViewport: (params: { scale: number }) => { width: number; height: number };
  }) {
    const viewport = page.getViewport({ scale: 1 });
    if (viewport.width > 0) {
      setPageAspectRatio(viewport.height / viewport.width);
    }

    if (!onPageTextLoaded) return;
    const textContent = (await page.getTextContent()) as { items?: { str?: string }[] };
    const text = (textContent.items ?? []).map((item) => item.str ?? "").join(" ");
    onPageTextLoaded(text);
  }

  return (
    <div className={`pdf-viewer${penMode ? " pen-mode-active" : ""}`} ref={containerRef}>
      <div
        className={`pdf-viewer-page${penMode ? " pen-mode-active" : ""}`}
        ref={pageWrapperRef}
        onClick={handleClick}
        style={hasActiveSelection ? { touchAction: "none" } : undefined}
      >
        <div style={{ position: "relative" }}>
          <Document
            file={fileUrl}
            onLoadSuccess={(pdf) => {
              setNumPages(pdf.numPages);
              setDocumentLoaded(true);
              onDocumentLoad?.(pdf);
            }}
          >
            <Page
              pageNumber={clampPage(currentPage, numPages)}
              width={pageWidth}
              onLoadSuccess={handlePageLoadSuccess}
              // No text layer while drawing. Refusing selectstart and
              // setting user-select: none both try to out-argue WebKit's
              // gesture handling and lose to it somewhere -- a stylus
              // near existing ink still ends up selecting text, and a
              // selection left on screen then steals following strokes
              // via its drag handles. Removing the selectable text
              // removes the whole class of failure instead of blocking
              // each route into it.
              //
              // Nothing is given up: tap-to-select and selectionchange
              // already bail out in pen mode, and page text for the
              // reflection chat comes from page.getTextContent(), which
              // does not depend on the layer being rendered.
              renderTextLayer={!penMode}
            />
          </Document>
          {
            // pdf.js's own TextLayer/AnnotationLayer set z-index: 2/3 in
            // their CSS — without an explicit z-index here, this overlay
            // sits below them in stacking order despite coming later in
            // the DOM, so pointer input silently falls through to text
            // selection / native scroll instead of reaching the canvas.
            // Always mounted (not just in pen mode) so previously drawn
            // notes stay visible while reading — AnnotationCanvas's own
            // `interactive` prop is what gates pointer capture, so
            // scrolling/zooming isn't blocked outside pen mode.
            //
            // pointerEvents must ALSO be set explicitly here, on this
            // plain <div> wrapper: unlike SVG (which defaults to
            // `visiblePainted` — no hit-testing without actual paint), a
            // bare HTML div defaults to `pointer-events: auto` even with
            // no visible content, so without this it would keep blocking
            // every touch on the PDF page (including native text
            // selection) regardless of what AnnotationCanvas's own
            // internal elements are set to.
          }
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              zIndex: 10,
              pointerEvents: penMode ? "auto" : "none",
              // Put the ink overlay on its own compositing layer. Without
              // this it shares a layer with the PDF canvas beneath it and
              // the pen-mode box-shadows, so every rewrite of the live
              // stroke's `d` repaints all of that on the CPU — which is
              // what makes drawing lag while erasing (same JS cost, but it
              // only moves a tiny cursor circle) stays smooth.
              transform: "translateZ(0)",
              // Hint only while pen mode is on, so the layer is created
              // when the mode is toggled rather than on the first stroke,
              // and no memory is held for it while merely reading.
              willChange: penMode ? "transform" : "auto",
            }}
          >
            <AnnotationCanvas
              width={effectivePageWidth}
              height={pageHeight}
              strokes={strokes ?? []}
              onStrokeComplete={(newStrokes) => onStrokeComplete?.(newStrokes)}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              tool={tool}
              onEraseStroke={(index) => onEraseStroke?.(index)}
              interactive={penMode}
              onProfileReport={inkDebug ? setInkReport : undefined}
            />
          </div>
        </div>
      </div>
      {penMode && (
        <AnnotationToolbar
          tool={tool}
          color={strokeColor}
          width={strokeWidth}
          onToolChange={setTool}
          onColorChange={setStrokeColor}
          onWidthChange={setStrokeWidth}
        />
      )}
      {inkDebug && (
        <pre
          data-testid="ink-debug-hud"
          style={{
            margin: "8px 0 0",
            padding: "6px 8px",
            font: "11px/1.35 ui-monospace, monospace",
            color: "#d6f5d6",
            background: "rgba(0,0,0,0.78)",
            borderRadius: 6,
            // Below the page, never over it. Overlaying the drawing area
            // made this diagnostic a participant in the bug it was meant
            // to observe: its own text became a selection target sitting
            // above the canvas.
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            whiteSpace: "pre",
            overflowX: "auto",
          }}
        >
          {`build ${process.env.NEXT_PUBLIC_BUILD_SHA ?? "?"}
`}
          {inkReport ? formatReport(inkReport) : "ink profiler armed — draw a stroke"}
        </pre>
      )}
      <div className="pdf-viewer-controls">
        <button
          type="button"
          onClick={() => setCurrentPage((page) => previousPage(page, numPages))}
          disabled={!canGoPrevious(currentPage)}
        >
          上一頁
        </button>
        <span>
          {currentPage} / {numPages}
        </span>
        <button
          type="button"
          onClick={() => setCurrentPage((page) => nextPage(page, numPages))}
          disabled={!canGoNext(currentPage, numPages)}
        >
          下一頁
        </button>
        <button type="button" onClick={() => setPenMode((mode) => !mode)}>
          {penMode ? "關閉畫筆模式" : "畫筆模式"}
        </button>
      </div>
    </div>
  );
}
