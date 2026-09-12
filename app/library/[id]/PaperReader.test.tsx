import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/components/PdfViewer", () => ({
  default: ({
    onTextSelected,
    onPageChange,
    onPageTextLoaded,
    onStrokeComplete,
    onEraseStroke,
    onReachedLastPage,
    strokes,
    onDocumentLoad,
  }: {
    onTextSelected?: (text: string) => void;
    onPageChange?: (page: number) => void;
    onPageTextLoaded?: (text: string) => void;
    onStrokeComplete?: (
      strokes: { points: { x: number; y: number }[]; color?: string; width?: number }[]
    ) => void;
    onEraseStroke?: (index: number) => void;
    onReachedLastPage?: () => void;
    strokes?: unknown[];
    onDocumentLoad?: (pdf: unknown) => void;
  }) => (
    <div>
      <button onClick={() => onTextSelected?.("excerpt")}>simulate-select</button>
      <button onClick={() => onPageChange?.(5)}>simulate-page-5</button>
      <button onClick={() => onPageTextLoaded?.("整頁文字內容")}>simulate-page-text</button>
      <button
        onClick={() => onStrokeComplete?.([{ points: [{ x: 0.1, y: 0.1 }] }])}
      >
        simulate-stroke-complete
      </button>
      <button
        onClick={() =>
          onStrokeComplete?.([
            { points: [{ x: 0.1, y: 0.1 }], color: "#1d4ed8", width: 8 },
          ])
        }
      >
        simulate-stroke-complete-styled
      </button>
      <button onClick={() => onEraseStroke?.(0)}>simulate-erase-stroke-0</button>
      <button onClick={() => onReachedLastPage?.()}>simulate-reached-last-page</button>
      <button onClick={() => onDocumentLoad?.({ fake: "pdf-document" })}>
        simulate-document-load
      </button>
      <div data-testid="strokes-for-current-page">{JSON.stringify(strokes ?? [])}</div>
    </div>
  ),
}));

vi.mock("@/components/ReflectionChat", () => ({
  default: ({
    messages,
    onSubmit,
  }: {
    messages: { id: string; content: string }[];
    onSubmit: (message: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  }) => (
    <div>
      <ul data-testid="reflection-messages">
        {messages.map((m) => (
          <li key={m.id}>{m.content}</li>
        ))}
      </ul>
      <button onClick={() => onSubmit("我的心得")}>simulate-reflection-submit</button>
    </div>
  ),
}));

const extractFullTextMock = vi.fn();
vi.mock("@/lib/pdf/extract-full-text", () => ({
  extractFullText: (...args: unknown[]) => extractFullTextMock(...args),
}));

vi.mock("@/components/TranslationPanel", () => ({
  default: ({ pageText }: { pageText?: string | null }) => (
    <div data-testid="translation-panel">{pageText ?? "(no page text)"}</div>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({}),
}));

const createNoteMock = vi.fn();
vi.mock("@/lib/notes/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notes/queries")>(
    "@/lib/notes/queries"
  );
  return { ...actual, createNote: (...args: unknown[]) => createNoteMock(...args) };
});

const createStrokeNoteMock = vi.fn();
const deleteStrokeNoteMock = vi.fn();
vi.mock("@/lib/annotations/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/annotations/queries")>(
    "@/lib/annotations/queries"
  );
  return {
    ...actual,
    createStrokeNote: (...args: unknown[]) => createStrokeNoteMock(...args),
    deleteStrokeNote: (...args: unknown[]) => deleteStrokeNoteMock(...args),
  };
});

const markReachedLastPageMock = vi.fn();
const markFinishedReadingMock = vi.fn();
vi.mock("@/lib/reading-completion/queries", () => ({
  markReachedLastPage: (...args: unknown[]) => markReachedLastPageMock(...args),
  markFinishedReading: (...args: unknown[]) => markFinishedReadingMock(...args),
}));

import PaperReader from "./PaperReader";
import type { Note } from "@/lib/notes/queries";

const existingNote: Note = {
  id: "n0",
  paper_id: "p1",
  user_id: "u1",
  page_number: 1,
  position: null,
  selected_text: null,
  note_text: "既有筆記",
  created_at: "2026-08-20T00:00:00.000Z",
};

describe("PaperReader", () => {
  it("renders notes fetched server-side (initialNotes), not from any local cache", () => {
    render(<PaperReader fileUrl="/x.pdf" paperId="p1" initialNotes={[existingNote]} />);
    expect(screen.getByText("既有筆記")).toBeInTheDocument();
  });

  it("still renders correctly with local storage completely cleared, since notes/papers are never read from it", () => {
    localStorage.clear();
    sessionStorage.clear();

    render(<PaperReader fileUrl="/x.pdf" paperId="p1" initialNotes={[existingNote]} />);

    expect(screen.getByText("既有筆記")).toBeInTheDocument();
  });

  it("creates a note bound to the current page and selected text, then shows it in the list", async () => {
    createNoteMock.mockResolvedValue({
      id: "n1",
      paper_id: "p1",
      user_id: "u1",
      page_number: 5,
      position: null,
      selected_text: "excerpt",
      note_text: "新筆記",
      created_at: "2026-08-27T00:00:00.000Z",
    });

    render(<PaperReader fileUrl="/x.pdf" paperId="p1" initialNotes={[]} />);

    fireEvent.click(screen.getByText("simulate-page-5"));
    fireEvent.click(screen.getByText("simulate-select"));

    fireEvent.change(screen.getByLabelText("筆記內容"), { target: { value: "新筆記" } });
    fireEvent.click(screen.getByRole("button", { name: /新增筆記/ }));

    expect(createNoteMock).toHaveBeenCalledWith(
      {},
      { paperId: "p1", pageNumber: 5, selectedText: "excerpt", noteText: "新筆記" }
    );

    await waitFor(() => expect(screen.getByText("新筆記")).toBeInTheDocument());
  });

  it("passes the current page's extracted text down to TranslationPanel", () => {
    render(<PaperReader fileUrl="/x.pdf" paperId="p1" initialNotes={[]} />);

    fireEvent.click(screen.getByText("simulate-page-text"));

    expect(screen.getByTestId("translation-panel")).toHaveTextContent("整頁文字內容");
  });

  it("saves a completed stroke via createStrokeNote and shows it in the note list without a reload", async () => {
    createStrokeNoteMock.mockResolvedValue({
      id: "n2",
      paper_id: "p1",
      user_id: "u1",
      page_number: 1,
      position: null,
      selected_text: null,
      note_text: null,
      strokes: [{ points: [{ x: 0.1, y: 0.1 }] }],
      created_at: "2026-08-31T00:00:00.000Z",
    });

    render(<PaperReader fileUrl="/x.pdf" paperId="p1" initialNotes={[]} />);

    fireEvent.click(screen.getByText("simulate-stroke-complete"));

    expect(createStrokeNoteMock).toHaveBeenCalledWith(
      {},
      { paperId: "p1", pageNumber: 1, strokes: [{ points: [{ x: 0.1, y: 0.1 }] }] }
    );

    await waitFor(() =>
      expect(screen.getByTestId("strokes-for-current-page")).toHaveTextContent(
        JSON.stringify([{ points: [{ x: 0.1, y: 0.1 }] }])
      )
    );
  });

  it("saves a stroke's color/width via createStrokeNote exactly as reported by PdfViewer, without stripping them", async () => {
    createStrokeNoteMock.mockResolvedValue({
      id: "n5",
      paper_id: "p1",
      user_id: "u1",
      page_number: 1,
      position: null,
      selected_text: null,
      note_text: null,
      strokes: [{ points: [{ x: 0.1, y: 0.1 }], color: "#1d4ed8", width: 8 }],
      created_at: "2026-09-07T00:00:00.000Z",
    });

    render(<PaperReader fileUrl="/x.pdf" paperId="p1" initialNotes={[]} />);

    fireEvent.click(screen.getByText("simulate-stroke-complete-styled"));

    expect(createStrokeNoteMock).toHaveBeenCalledWith(
      {},
      {
        paperId: "p1",
        pageNumber: 1,
        strokes: [{ points: [{ x: 0.1, y: 0.1 }], color: "#1d4ed8", width: 8 }],
      }
    );
  });

  it("removes a note from the list once its stroke is erased and deleteStrokeNote resolves", async () => {
    deleteStrokeNoteMock.mockResolvedValue(undefined);
    const strokeNote: Note = {
      id: "n6",
      paper_id: "p1",
      user_id: "u1",
      page_number: 1,
      position: null,
      selected_text: null,
      note_text: null,
      strokes: [{ points: [{ x: 0.2, y: 0.2 }] }],
      created_at: "2026-09-07T00:00:00.000Z",
    };

    render(<PaperReader fileUrl="/x.pdf" paperId="p1" initialNotes={[strokeNote]} />);
    expect(screen.getByTestId("strokes-for-current-page")).toHaveTextContent(
      JSON.stringify([{ points: [{ x: 0.2, y: 0.2 }] }])
    );

    fireEvent.click(screen.getByText("simulate-erase-stroke-0"));

    expect(deleteStrokeNoteMock).toHaveBeenCalledWith({}, "n6");
    await waitFor(() =>
      expect(screen.getByTestId("strokes-for-current-page")).toHaveTextContent("[]")
    );
  });

  it("keeps a note in the list when deleteStrokeNote fails, instead of removing it optimistically", async () => {
    deleteStrokeNoteMock.mockRejectedValue(new Error("network error"));
    const strokeNote: Note = {
      id: "n7",
      paper_id: "p1",
      user_id: "u1",
      page_number: 1,
      position: null,
      selected_text: null,
      note_text: null,
      strokes: [{ points: [{ x: 0.2, y: 0.2 }] }],
      created_at: "2026-09-07T00:00:00.000Z",
    };

    render(<PaperReader fileUrl="/x.pdf" paperId="p1" initialNotes={[strokeNote]} />);

    fireEvent.click(screen.getByText("simulate-erase-stroke-0"));

    await waitFor(() => expect(deleteStrokeNoteMock).toHaveBeenCalledWith({}, "n7"));
    expect(screen.getByTestId("strokes-for-current-page")).toHaveTextContent(
      JSON.stringify([{ points: [{ x: 0.2, y: 0.2 }] }])
    );
  });

  it("calls markReachedLastPage when the reader reaches the last page for the first time", async () => {
    markReachedLastPageMock.mockResolvedValue(undefined);
    render(
      <PaperReader
        fileUrl="/x.pdf"
        paperId="p1"
        initialNotes={[]}
        initialReachedLastPage={false}
      />
    );

    fireEvent.click(screen.getByText("simulate-reached-last-page"));

    await waitFor(() => expect(markReachedLastPageMock).toHaveBeenCalledWith({}, "p1"));
  });

  it("does not call markReachedLastPage again once the paper is already known to have reached its last page", () => {
    markReachedLastPageMock.mockClear();
    render(
      <PaperReader
        fileUrl="/x.pdf"
        paperId="p1"
        initialNotes={[]}
        initialReachedLastPage={true}
      />
    );

    fireEvent.click(screen.getByText("simulate-reached-last-page"));

    expect(markReachedLastPageMock).not.toHaveBeenCalled();
  });

  it("disables the mark-finished button until the reader has reached the last page", () => {
    render(
      <PaperReader
        fileUrl="/x.pdf"
        paperId="p1"
        initialNotes={[]}
        initialReachedLastPage={false}
      />
    );

    expect(screen.getByRole("button", { name: /標記為已讀完/ })).toBeDisabled();
  });

  it("marks the paper finished and shows a badge once the button is clicked after reaching the last page", async () => {
    markFinishedReadingMock.mockResolvedValue({
      id: "p1",
      user_id: "u1",
      title: "Test Paper",
      storage_path: "u1/test.pdf",
      uploaded_at: "2026-09-07T00:00:00.000Z",
      metadata: {},
      reached_last_page: true,
      finished_reading: true,
      finished_at: "2026-09-07T00:00:00.000Z",
      imported_to_detabase: false,
    });

    render(
      <PaperReader
        fileUrl="/x.pdf"
        paperId="p1"
        initialNotes={[]}
        initialReachedLastPage={true}
      />
    );

    const markFinishedButton = screen.getByRole("button", { name: /標記為已讀完/ });
    expect(markFinishedButton).not.toBeDisabled();
    fireEvent.click(markFinishedButton);

    expect(markFinishedReadingMock).toHaveBeenCalledWith({}, "p1");
    await waitFor(() => expect(screen.getByText("✅ 已讀完")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /標記為已讀完/ })).not.toBeInTheDocument();
  });

  it("shows an error and keeps the button available when marking finished fails", async () => {
    markFinishedReadingMock.mockRejectedValue(new Error("network error"));

    render(
      <PaperReader
        fileUrl="/x.pdf"
        paperId="p1"
        initialNotes={[]}
        initialReachedLastPage={true}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /標記為已讀完/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("✅ 已讀完")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /標記為已讀完/ })).not.toBeDisabled();
  });

  it("shows an imported badge alongside the finished badge when the paper has already been imported", () => {
    render(
      <PaperReader
        fileUrl="/x.pdf"
        paperId="p1"
        initialNotes={[]}
        initialReachedLastPage={true}
        initialFinishedReading={true}
        initialImportedToDetabase={true}
      />
    );

    expect(screen.getByText("✅ 已讀完")).toBeInTheDocument();
    expect(screen.getByText("📥 已匯入")).toBeInTheDocument();
  });

  it("passes only the current page's stroke notes down to PdfViewer", () => {
    const strokeNoteOnPage1: Note = {
      id: "n3",
      paper_id: "p1",
      user_id: "u1",
      page_number: 1,
      position: null,
      selected_text: null,
      note_text: null,
      strokes: [{ points: [{ x: 0.2, y: 0.2 }] }],
      created_at: "2026-08-31T00:00:00.000Z",
    };
    const strokeNoteOnPage5: Note = { ...strokeNoteOnPage1, id: "n4", page_number: 5 };

    render(
      <PaperReader
        fileUrl="/x.pdf"
        paperId="p1"
        initialNotes={[strokeNoteOnPage1, strokeNoteOnPage5]}
      />
    );

    // Still on page 1 by default — only n3's strokes should be passed down.
    const passed = JSON.parse(
      screen.getByTestId("strokes-for-current-page").textContent ?? "[]"
    );
    expect(passed).toEqual([{ points: [{ x: 0.2, y: 0.2 }] }]);
  });

  it("extracts the full text once the PDF document has loaded and sends it with the reflection message", async () => {
    extractFullTextMock.mockResolvedValue("論文全文內容");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "AI 的回饋" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PaperReader fileUrl="/x.pdf" paperId="p1" initialNotes={[]} initialReflectionMessages={[]} />);

    fireEvent.click(screen.getByText("simulate-document-load"));
    fireEvent.click(screen.getByText("simulate-reflection-submit"));

    await waitFor(() => expect(extractFullTextMock).toHaveBeenCalledWith({ fake: "pdf-document" }));

    await waitFor(() => {
      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toEqual({ paperId: "p1", message: "我的心得", paperFullText: "論文全文內容" });
    });

    await waitFor(() =>
      expect(screen.getByTestId("reflection-messages")).toHaveTextContent("AI 的回饋")
    );

    vi.unstubAllGlobals();
  });

  it("surfaces a clear error instead of throwing when full-text extraction fails, without affecting other panels", async () => {
    extractFullTextMock.mockRejectedValue(new Error("PDF 損毀"));

    render(<PaperReader fileUrl="/x.pdf" paperId="p1" initialNotes={[]} initialReflectionMessages={[]} />);

    fireEvent.click(screen.getByText("simulate-document-load"));
    fireEvent.click(screen.getByText("simulate-reflection-submit"));

    // The other panels (translation, notes) must remain usable.
    await waitFor(() => expect(screen.getByTestId("translation-panel")).toBeInTheDocument());
    expect(screen.getByLabelText("筆記內容")).toBeInTheDocument();
  });

  it("renders reflection messages fetched server-side (initialReflectionMessages)", () => {
    render(
      <PaperReader
        fileUrl="/x.pdf"
        paperId="p1"
        initialNotes={[]}
        initialReflectionMessages={[
          {
            id: "r1",
            paper_id: "p1",
            user_id: "u1",
            role: "user",
            content: "先前的心得",
            created_at: "2026-08-30T00:00:00.000Z",
          },
        ]}
      />
    );

    expect(screen.getByText("先前的心得")).toBeInTheDocument();
  });
});
