"use client";

import { useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; translatedText: string }
  | { kind: "error"; message: string };

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
    <aside className="translation-panel">
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
      {selectedText && <blockquote>{selectedText}</blockquote>}
      {status.kind === "success" && <p>{status.translatedText}</p>}
      {status.kind === "error" && <p role="alert">{status.message}</p>}
    </aside>
  );
}
