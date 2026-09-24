import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaperCard from "./PaperCard";

const renamePaperMock = vi.fn();
const setReadingStageMock = vi.fn();
const softDeletePaperMock = vi.fn();
const restorePaperMock = vi.fn();
const purgePaperMock = vi.fn();

vi.mock("@/lib/papers/queries", () => ({
  renamePaper: (...a: unknown[]) => renamePaperMock(...a),
  softDeletePaper: (...a: unknown[]) => softDeletePaperMock(...a),
  restorePaper: (...a: unknown[]) => restorePaperMock(...a),
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

  // BLOCKING 2: a second click before the first purge's round trip lands
  // must not re-issue purgePaper for a row that may already be gone.
  it("disables the confirm-purge button while a purge is in flight, so a second click fires nothing", async () => {
    let resolvePurge!: () => void;
    purgePaperMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePurge = resolve;
        })
    );
    render(
      <PaperCard
        paper={{ ...paper, deleted_at: "2026-09-20T00:00:00.000Z" }}
        noteCount={0}
        onChanged={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));
    const confirmButton = screen.getByRole("button", { name: "確定永久刪除" });

    fireEvent.click(confirmButton);
    await waitFor(() => expect(confirmButton).toBeDisabled());

    fireEvent.click(confirmButton);
    expect(purgePaperMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    resolvePurge();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  // IMPORTANT 3: choosing a new stage must be reflected immediately, not
  // only after the server round trip lands — otherwise the select snaps
  // back to the old value and reads as a rejected choice.
  it("shows the newly chosen stage immediately, before the write resolves", async () => {
    let resolveStage!: (value: unknown) => void;
    setReadingStageMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStage = resolve;
        })
    );
    render(<PaperCard paper={paper} noteCount={0} onChanged={vi.fn()} />);

    const select = screen.getByLabelText("閱讀階段") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "finished" } });

    expect(select).toHaveValue("finished");

    resolveStage({ ...paper, reading_stage: "finished" });
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(select).toHaveValue("finished");
  });

  it("reverts the stage selection and reports an error when the write fails", async () => {
    setReadingStageMock.mockRejectedValue(new Error("boom"));
    render(<PaperCard paper={paper} noteCount={0} onChanged={vi.fn()} />);

    const select = screen.getByLabelText("閱讀階段") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "finished" } });

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(select).toHaveValue("up_next");
  });

  // IMPORTANT 5: a removed paper must not be a live link into the reader,
  // where it could still be annotated or marked finished while trashed.
  it("does not link a removed paper into the reader", () => {
    render(
      <PaperCard
        paper={{ ...paper, deleted_at: "2026-09-20T00:00:00.000Z" }}
        noteCount={0}
        onChanged={vi.fn()}
      />
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Guidelines for Human-AI Interaction")).toBeInTheDocument();
  });

  it("links a paper still in the library into the reader", () => {
    render(<PaperCard paper={paper} noteCount={0} onChanged={vi.fn()} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/library/p1");
  });

  // IMPORTANT 6: a failed note count must read as an honest "unknown",
  // never as a confident zero, right before an irreversible delete.
  it("shows an unquantified warning instead of a false zero when the note count is unknown", () => {
    render(
      <PaperCard
        paper={{ ...paper, deleted_at: "2026-09-20T00:00:00.000Z" }}
        noteCount={null}
        onChanged={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("它的筆記與畫記");
    expect(dialog).not.toHaveTextContent("它的 0 筆");
  });

  // MINOR 9: a stale error from an earlier action must not linger under
  // the card through a later, successful action.
  it("clears a previous error once restore succeeds", async () => {
    restorePaperMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
    render(
      <PaperCard
        paper={{ ...paper, deleted_at: "2026-09-20T00:00:00.000Z" }}
        noteCount={0}
        onChanged={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "還原" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "還原" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
