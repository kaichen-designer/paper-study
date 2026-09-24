import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaperCard from "./PaperCard";

const renamePaperMock = vi.fn();
const setReadingStageMock = vi.fn();
const softDeletePaperMock = vi.fn();
const purgePaperMock = vi.fn();

vi.mock("@/lib/papers/queries", () => ({
  renamePaper: (...a: unknown[]) => renamePaperMock(...a),
  softDeletePaper: (...a: unknown[]) => softDeletePaperMock(...a),
  restorePaper: vi.fn(),
  purgePaper: (...a: unknown[]) => purgePaperMock(...a),
}));

vi.mock("@/lib/papers/reading-stage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/papers/reading-stage")>(
    "@/lib/papers/reading-stage"
  );
  return { ...actual, setReadingStage: (...a: unknown[]) => setReadingStageMock(...a) };
});

vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("./PaperThumbnail", () => ({ default: () => <div data-testid="thumb" /> }));

const paper = {
  id: "p1",
  user_id: "u1",
  title: "Guidelines for Human-AI Interaction",
  storage_path: "u1/p1.pdf",
  uploaded_at: "2026-09-01T00:00:00.000Z",
  metadata: {},
  reached_last_page: false,
  finished_reading: false,
  finished_at: null,
  imported_to_detabase: false,
  reading_stage: "up_next" as const,
  deleted_at: null,
  fileUrl: "/x.pdf",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PaperCard", () => {
  it("renames the paper and shows the new title", async () => {
    renamePaperMock.mockResolvedValue({ ...paper, title: "新標題" });
    render(<PaperCard paper={paper} noteCount={0} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));
    fireEvent.change(screen.getByLabelText("論文標題"), { target: { value: "  新標題  " } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(renamePaperMock).toHaveBeenCalledWith({}, "p1", "  新標題  "));
    await waitFor(() => expect(screen.getByText("新標題")).toBeInTheDocument());
  });

  it("reports a blank title, keeps the editor open, and leaves the stored title alone", async () => {
    renamePaperMock.mockRejectedValue(new Error("empty"));
    render(<PaperCard paper={paper} noteCount={0} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "重新命名" }));
    fireEvent.change(screen.getByLabelText("論文標題"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    // Still editing: a rejected title is one the user wants to correct,
    // so the field and what they typed must survive the error.
    expect(screen.getByLabelText("論文標題")).toHaveValue("   ");

    // And the title itself was never changed.
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByText("Guidelines for Human-AI Interaction")).toBeInTheDocument();
  });

  it("changes the reading stage only when asked", async () => {
    setReadingStageMock.mockResolvedValue({ ...paper, reading_stage: "reading" });
    const onChanged = vi.fn();
    render(<PaperCard paper={paper} noteCount={0} onChanged={onChanged} />);

    // Rendering alone must not move a paper between stages.
    expect(setReadingStageMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("閱讀階段"), { target: { value: "reading" } });

    await waitFor(() => expect(setReadingStageMock).toHaveBeenCalledWith({}, "p1", "reading"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("removes a paper without asking, because removal is recoverable", async () => {
    softDeletePaperMock.mockResolvedValue(undefined);
    render(<PaperCard paper={paper} noteCount={0} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "移至回收筒" }));

    await waitFor(() => expect(softDeletePaperMock).toHaveBeenCalledWith({}, "p1"));
  });

  it("shows an imported indicator when the paper has been imported", () => {
    render(<PaperCard paper={{ ...paper, imported_to_detabase: true }} noteCount={0} onChanged={vi.fn()} />);
    expect(screen.getByText("📥 已匯入")).toBeInTheDocument();
  });

  it("shows no imported indicator when the paper has not been imported", () => {
    render(<PaperCard paper={{ ...paper, imported_to_detabase: false }} noteCount={0} onChanged={vi.fn()} />);
    expect(screen.queryByText("📥 已匯入")).not.toBeInTheDocument();
  });

  it("requires confirmation naming the note count before permanent deletion", async () => {
    render(
      <PaperCard paper={{ ...paper, deleted_at: "2026-09-20T00:00:00.000Z" }} noteCount={12} onChanged={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));

    expect(purgePaperMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("12");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("反思對話");

    fireEvent.click(screen.getByRole("button", { name: "確定永久刪除" }));
    await waitFor(() => expect(purgePaperMock).toHaveBeenCalled());
  });
});
