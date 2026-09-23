"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import PdfViewer from "@/components/PdfViewer";
import TranslationPanel from "@/components/TranslationPanel";
import NoteForm from "@/components/NoteForm";
import NoteList from "@/components/NoteList";
import ReflectionChat from "@/components/ReflectionChat";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createNote, type Note } from "@/lib/notes/queries";
import { createStrokeNote, deleteStrokeNote, type Stroke } from "@/lib/annotations/queries";
import { markReachedLastPage, markFinishedReading } from "@/lib/reading-completion/queries";
import type { ReflectionMessage } from "@/lib/reflection/queries";
import { extractFullText, type PdfDocumentProxy } from "@/lib/pdf/extract-full-text";

export default function PaperReader({
  fileUrl,
  paperId,
  initialNotes,
  initialReflectionMessages = [],
  initialReachedLastPage = false,
  initialFinishedReading = false,
  initialImportedToDetabase = false,
}: {
  fileUrl: string;
  paperId: string;
  initialNotes: Note[];
  initialReflectionMessages?: ReflectionMessage[];
  initialReachedLastPage?: boolean;
  initialFinishedReading?: boolean;
  initialImportedToDetabase?: boolean;
}) {
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageText, setPageText] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [reflectionMessages, setReflectionMessages] = useState<ReflectionMessage[]>(
    initialReflectionMessages
  );
  const [reachedLastPage, setReachedLastPage] = useState(initialReachedLastPage);
  const [finishedReading, setFinishedReading] = useState(initialFinishedReading);
  const [importedToDetabase] = useState(initialImportedToDetabase);
  const [finishStatus, setFinishStatus] = useState<
    { kind: "idle" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const pdfDocumentRef = useRef<PdfDocumentProxy | null>(null);
  const fullTextRef = useRef<string | null>(null);

  async function handleSubmitNote({
    pageNumber,
    selectedText,
    noteText,
  }: {
    pageNumber: number;
    selectedText: string | null;
    noteText: string;
  }) {
    const supabase = getSupabaseBrowserClient();
    const note = await createNote(supabase, {
      paperId,
      pageNumber,
      selectedText: selectedText ?? undefined,
      noteText,
    });
    setNotes((current) => [...current, note]);
  }

  // Stable identity: this is handed down to the memoized AnnotationCanvas,
  // and a new function each render would re-render every stroke on the
  // page whenever anything else here changes -- chat messages, page text,
  // finish status.
  const handleStrokeComplete = useCallback(
    async (strokes: Stroke[]) => {
      const supabase = getSupabaseBrowserClient();
      const note = await createStrokeNote(supabase, {
        paperId,
        pageNumber: currentPage,
        strokes,
      });
      if (note) {
        setNotes((current) => [...current, note as Note]);
      }
    },
    [paperId, currentPage]
  );

  async function handleReachedLastPage() {
    if (reachedLastPage) return;
    const supabase = getSupabaseBrowserClient();
    try {
      await markReachedLastPage(supabase, paperId);
    } catch {
      // Silent, best-effort: this fires on ordinary page navigation, not a
      // user-initiated action, so there is nothing useful to surface. The
      // next time the reader reaches the last page, this will retry.
      return;
    }
    setReachedLastPage(true);
  }

  async function handleMarkFinished() {
    const supabase = getSupabaseBrowserClient();
    try {
      await markFinishedReading(supabase, paperId);
    } catch {
      setFinishStatus({ kind: "error", message: "標記失敗,請稍後再試。" });
      return;
    }
    setFinishStatus({ kind: "idle" });
    setFinishedReading(true);
  }

  async function handleReflectionSubmit(
    message: string
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    // Extract full text once, on first use, and reuse it for later turns
    // in the same session — see design.md's extraction-timing decision.
    if (!fullTextRef.current) {
      if (!pdfDocumentRef.current) {
        return { ok: false, message: "PDF 尚未載入完成,請稍後再試。" };
      }
      try {
        fullTextRef.current = await extractFullText(pdfDocumentRef.current);
      } catch {
        return { ok: false, message: "無法讀取論文全文內容,請稍後再試。" };
      }
    }

    try {
      const response = await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId, message, paperFullText: fullTextRef.current }),
      });
      const body = await response.json();

      if (!response.ok) {
        return { ok: false, message: body.error ?? "送出失敗,請稍後再試。" };
      }

      setReflectionMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-user`,
          paper_id: paperId,
          user_id: "",
          role: "user",
          content: message,
          created_at: new Date().toISOString(),
        },
        {
          id: `${Date.now()}-assistant`,
          paper_id: paperId,
          user_id: "",
          role: "assistant",
          content: body.reply,
          created_at: new Date().toISOString(),
        },
      ]);

      return { ok: true };
    } catch {
      return { ok: false, message: "送出失敗,請稍後再試。" };
    }
  }

  // Memoized so these arrays keep their identity across renders that did
  // not touch the notes — this component re-renders for chat messages,
  // page text and finish-status changes, and a fresh array each time
  // would defeat the per-stroke path cache in AnnotationCanvas.
  const { strokesForCurrentPage, noteIdsForCurrentPageStrokes } = useMemo(() => {
    const notesWithStrokesOnCurrentPage = notes.filter(
      (note) => note.page_number === currentPage && note.strokes
    );
    return {
      strokesForCurrentPage: notesWithStrokesOnCurrentPage.flatMap(
        (note) => note.strokes as Stroke[]
      ),
      // Parallel to strokesForCurrentPage — index N here is the note that
      // owns the stroke at index N there, so an eraser's reported index
      // (which only knows about the flattened AnnotationCanvas array) can
      // be mapped back to the note record it must delete. See design.md's
      // "One Stroke Per Note Record" decision: each note holds exactly one
      // stroke in this app.
      noteIdsForCurrentPageStrokes: notesWithStrokesOnCurrentPage.flatMap((note) =>
        (note.strokes as Stroke[]).map(() => note.id)
      ),
    };
  }, [notes, currentPage]);

  // Stable identity for the same reason as handleStrokeComplete.
  const handleEraseStroke = useCallback(
    async (index: number) => {
      const noteId = noteIdsForCurrentPageStrokes[index];
      if (!noteId) return;

      const supabase = getSupabaseBrowserClient();
      try {
        await deleteStrokeNote(supabase, noteId);
      } catch {
        // Keep the stroke visible rather than removing it optimistically —
        // see design.md's failure-mode decision for deleteStrokeNote.
        return;
      }
      setNotes((current) => current.filter((note) => note.id !== noteId));
    },
    [noteIdsForCurrentPageStrokes]
  );

  return (
    <div>
      <div className="paper-reader">
        <PdfViewer
          fileUrl={fileUrl}
          onTextSelected={setSelectedText}
          onPageChange={setCurrentPage}
          onPageTextLoaded={setPageText}
          strokes={strokesForCurrentPage}
          onStrokeComplete={handleStrokeComplete}
          onEraseStroke={handleEraseStroke}
          onReachedLastPage={handleReachedLastPage}
          onDocumentLoad={(pdf) => {
            pdfDocumentRef.current = pdf;
          }}
        />
        <TranslationPanel selectedText={selectedText} pageText={pageText} paperId={paperId} />
      </div>
      <div className="reading-status">
        {finishedReading ? (
          <>
            <span className="reading-status-badge">✅ 已讀完</span>
            {importedToDetabase && <span className="reading-status-badge">📥 已匯入</span>}
          </>
        ) : (
          <>
            <button type="button" disabled={!reachedLastPage} onClick={handleMarkFinished}>
              標記為已讀完
            </button>
            {!reachedLastPage && <p className="reading-status-hint">先讀到最後一頁才能標記為已讀完</p>}
            {finishStatus.kind === "error" && <p role="alert">{finishStatus.message}</p>}
          </>
        )}
      </div>
      <NoteForm pageNumber={currentPage} selectedText={selectedText} onSubmitNote={handleSubmitNote} />
      <NoteList notes={notes} />
      <ReflectionChat messages={reflectionMessages} onSubmit={handleReflectionSubmit} />
    </div>
  );
}
