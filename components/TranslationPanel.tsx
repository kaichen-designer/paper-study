"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; translatedText: string }
  | { kind: "error"; message: string };

// Height limits for the user-adjustable panel. The ceiling is 90% of the
// viewport so the action bar and handle can never be pushed off screen; the
// stored-value cap only rejects obviously corrupt localStorage entries.
const MIN_HEIGHT = 200;
const MAX_STORED_HEIGHT = 4000;
const KEYBOARD_STEP = 24;
const STORAGE_KEY = "translation-panel-height";

function maxHeight(): number {
  return Math.floor(window.innerHeight * 0.9);
}

function clampHeight(height: number): number {
  return Math.min(Math.max(Math.round(height), MIN_HEIGHT), maxHeight());
}

// Every localStorage access can throw (private mode, blocked site data), and
// none of it is worth breaking translation over: failing just means the
// panel keeps its default height or does not remember a new one.
function readStoredHeight(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < MIN_HEIGHT || value > MAX_STORED_HEIGHT) return null;
    return value;
  } catch {
    return null;
  }
}

function storeHeight(height: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(height));
  } catch {
    // Not remembering the height is acceptable.
  }
}

/**
 * Side panel that shows a translation of either the currently selected PDF
 * text, or the whole current page (an alternative for when drag-selecting
 * precise text on a touch/pencil screen is unreliable). Deliberately never
 * mutates or overlays the original PDF rendering — see design.md's
 * "側邊/覆蓋翻譯面板" decision.
 */
export default function TranslationPanel({
  selectedText,
  pageText,
  paperId,
}: {
  selectedText: string | null;
  pageText?: string | null;
  paperId?: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const panelRef = useRef<HTMLElement>(null);

  // null = the user has not set a height, so the stylesheet's default
  // applies. `measuredHeight` and `maxPanelHeight` are read after mount (they
  // depend on layout and window size, which the server cannot know) and feed
  // the handle's aria-value* attributes.
  const [customHeight, setCustomHeight] = useState<number | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const [maxPanelHeight, setMaxPanelHeight] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const latestHeightRef = useRef<number | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    function measure() {
      if (panelRef.current) {
        setMeasuredHeight(Math.round(panelRef.current.getBoundingClientRect().height));
      }
    }
    measure();
    // The default (not user-set) height follows the content and the window,
    // so keep the handle's aria-valuenow in step with what is on screen.
    // jsdom has no ResizeObserver, hence the guard.
    const observer =
      panel && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (panel) observer?.observe(panel);
    setMaxPanelHeight(maxHeight());

    const stored = readStoredHeight();
    if (stored !== null) {
      const clamped = clampHeight(stored);
      latestHeightRef.current = clamped;
      setCustomHeight(clamped);
    }

    // A rotation changes the 90% ceiling; the CSS max-height already keeps
    // the panel inside the new viewport, this keeps aria-valuemax honest.
    function updateMax() {
      setMaxPanelHeight(maxHeight());
    }
    window.addEventListener("resize", updateMax);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateMax);
    };
  }, []);

  function currentHeight(): number {
    if (customHeight !== null) return customHeight;
    return Math.round(panelRef.current?.getBoundingClientRect().height ?? 0);
  }

  function applyHeight(next: number): number {
    const clamped = clampHeight(next);
    latestHeightRef.current = clamped;
    setCustomHeight(clamped);
    return clamped;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = { startY: event.clientY, startHeight: currentHeight() };
    // Keeps move/up events coming to the handle when the finger or pencil
    // leaves it mid-drag. Absent in jsdom, hence the optional call.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    applyHeight(drag.startHeight + (event.clientY - drag.startY));
  }

  function handlePointerEnd() {
    if (!dragRef.current) return;
    dragRef.current = null;
    // A tap that never moved has nothing new to remember.
    if (latestHeightRef.current !== null) storeHeight(latestHeightRef.current);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = currentHeight() + KEYBOARD_STEP;
        break;
      case "ArrowUp":
        next = currentHeight() - KEYBOARD_STEP;
        break;
      case "Home":
        next = MIN_HEIGHT;
        break;
      case "End":
        next = maxHeight();
        break;
      default:
        return;
    }
    event.preventDefault();
    storeHeight(applyHeight(next));
  }

  // The panel is its own scroll container (see .translation-panel in
  // globals.css), so a new result must start from its beginning rather than
  // wherever the previous, possibly longer, translation was scrolled to.
  // Assigning scrollTop (not scrollTo) keeps this testable under jsdom.
  useEffect(() => {
    if (status.kind === "success" && panelRef.current) {
      panelRef.current.scrollTop = 0;
    }
  }, [status]);

  async function translate(text: string) {
    setStatus({ kind: "loading" });

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLang: "ZH", paperId }),
      });
      const body = await response.json();

      if (!response.ok) {
        setStatus({ kind: "error", message: body.error ?? "翻譯失敗,請稍後再試。" });
        return;
      }

      setStatus({ kind: "success", translatedText: body.translatedText });
    } catch {
      setStatus({ kind: "error", message: "翻譯失敗,請稍後再試。" });
    }
  }

  return (
    <aside
      className="translation-panel"
      ref={panelRef}
      style={
        customHeight !== null
          ? ({ "--translation-panel-height": `${customHeight}px` } as CSSProperties)
          : undefined
      }
    >
      <div className="translation-panel-actions">
        <h2>翻譯</h2>
        <button
          type="button"
          onClick={() => selectedText && translate(selectedText)}
          disabled={!selectedText}
        >
          {status.kind === "loading" ? "翻譯中…" : "翻譯選取範圍"}
        </button>
        <button
          type="button"
          onClick={() => pageText && translate(pageText)}
          disabled={!pageText}
        >
          {status.kind === "loading" ? "翻譯中…" : "翻譯整頁"}
        </button>
      </div>
      {selectedText && (
        <blockquote className="translation-panel-source">{selectedText}</blockquote>
      )}
      {status.kind === "success" && (
        <p className="translation-panel-result">{status.translatedText}</p>
      )}
      {status.kind === "error" && <p role="alert">{status.message}</p>}
      <div
        className="translation-panel-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="調整翻譯面板高度"
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={maxPanelHeight ?? undefined}
        aria-valuenow={customHeight ?? measuredHeight ?? undefined}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        <span className="translation-panel-resizer-grip" aria-hidden="true" />
      </div>
    </aside>
  );
}
