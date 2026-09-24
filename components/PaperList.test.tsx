import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PaperList, { type PaperWithFileUrl } from "./PaperList";

// PaperList is a client component and calls useRouter() (for router.refresh()
// after a card reports a change). Nothing globally mocks next/navigation, so
// without this the render throws. Keep a reference to refreshMock so a
// change-propagation test could assert it was called.
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

// Mocked so the grouping tests are about grouping only, not about anything
// PaperCard itself renders (rename UI, stage select, badges, links, etc. —
// all owned and tested by PaperCard.test.tsx).
vi.mock("./PaperCard", () => ({
  default: ({ paper, noteCount }: { paper: { id: string; title: string }; noteCount: number }) => (
    <li data-testid={`card-${paper.id}`}>
      {paper.title}
      <span data-testid={`count-${paper.id}`}>{noteCount}</span>
    </li>
  ),
}));

// Same paper shape as PaperCard.test.tsx's `paper` fixture.
const base: PaperWithFileUrl = {
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
  reading_stage: "up_next",
  deleted_at: null,
  fileUrl: "/x.pdf",
};

describe("PaperList", () => {
  it("shows each paper under the group matching its reading stage", () => {
    render(
      <PaperList
        papers={[
          { ...base, id: "a", title: "A", reading_stage: "reading" },
          { ...base, id: "b", title: "B", reading_stage: "up_next" },
          { ...base, id: "c", title: "C", reading_stage: "finished" },
        ]}
        deletedPapers={[]}
        noteCounts={{}}
      />
    );

    for (const heading of ["正在讀", "接下來要讀", "讀完了"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("does not render a heading for a stage with no papers", () => {
    render(
      <PaperList
        papers={[{ ...base, id: "a", title: "A", reading_stage: "reading" }]}
        deletedPapers={[]}
        noteCounts={{}}
      />
    );

    expect(screen.getByRole("heading", { name: "正在讀" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "讀完了" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "接下來要讀" })).toBeNull();
  });

  it("renders each paper's title", () => {
    render(
      <PaperList
        papers={[{ ...base, id: "p1", title: "Paper One" }]}
        deletedPapers={[]}
        noteCounts={{}}
      />
    );
    expect(screen.getByText("Paper One")).toBeInTheDocument();
  });

  it("shows a friendly empty state when there are no papers yet", () => {
    render(<PaperList papers={[]} deletedPapers={[]} noteCounts={{}} />);
    expect(screen.getByText(/尚未上傳/)).toBeInTheDocument();
  });

  // IMPORTANT 7: once every paper has been trashed, papers.length === 0
  // no longer means "never uploaded" — the user just removed their last
  // paper, and the trash toggle right above proves it.
  it("shows a different empty message when every paper is in the trash, not the never-uploaded message", () => {
    render(
      <PaperList
        papers={[]}
        deletedPapers={[{ ...base, id: "d1", title: "D1" }]}
        noteCounts={{}}
      />
    );
    expect(screen.queryByText(/尚未上傳/)).not.toBeInTheDocument();
    expect(screen.getByText(/所有論文都在回收筒裡/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /回收筒/ })).toBeInTheDocument();
  });

  // Replaces the old "links each paper to its reading view by id" test.
  // The <Link> now lives inside PaperCard (owned and tested by
  // PaperCard.test.tsx); PaperCard is mocked in this file, so its href can't
  // be observed here. What PaperList itself is responsible for — threading
  // the right paper through to the right card — is what this checks.
  it("renders a card for each paper's id", () => {
    render(
      <PaperList
        papers={[{ ...base, id: "abc-123", title: "Paper One" }]}
        deletedPapers={[]}
        noteCounts={{}}
      />
    );
    expect(screen.getByTestId("card-abc-123")).toBeInTheDocument();
  });

  // Replaces the two "shows no status badge..." tests. Those asserted
  // absence of DOM text ("✅ 已讀完" / "📥 已匯入") that the mocked PaperCard
  // never renders regardless of input — they passed unconditionally, no
  // matter what PaperList did with the paper's flags. This instead
  // exercises something PaperList actually decides: which noteCount
  // reaches which card, keyed by paper id.
  it("gives each card the note count belonging to its own paper", () => {
    render(
      <PaperList
        papers={[
          { ...base, id: "a", title: "A", reading_stage: "reading" },
          { ...base, id: "b", title: "B", reading_stage: "reading" },
        ]}
        deletedPapers={[]}
        noteCounts={{ a: 7, b: 0 }}
      />
    );

    // A card that received another paper's count would name the wrong
    // number in its permanent-deletion confirmation.
    expect(screen.getByTestId("count-a")).toHaveTextContent("7");
    expect(screen.getByTestId("count-b")).toHaveTextContent("0");
  });

  // Replaces "shows only the finished badge when a paper is marked finished
  // but not yet imported". The old PaperList rendered the "✅ 已讀完" badge
  // itself; PaperCard (Task 7) does not render it (or the "📥 已匯入" badge)
  // at all, and PaperCard is mocked here, so badge presence can't be
  // observed at this layer any more. "Finished" is now conveyed instead by
  // which stage heading the paper is grouped under.
  it("groups a finished paper under the finished-stage heading", () => {
    render(
      <PaperList
        papers={[{ ...base, reading_stage: "finished", finished_reading: true, reached_last_page: true }]}
        deletedPapers={[]}
        noteCounts={{}}
      />
    );
    expect(screen.getByRole("heading", { name: "讀完了" })).toBeInTheDocument();
  });

  // "shows both the finished and imported badges when a paper has been
  // imported" is gone from this file: the "imported" indicator now lives
  // on PaperCard itself (component review, finding 2) and is covered by
  // PaperCard.test.tsx, not here.

  // Replaces "renders a cover thumbnail for each paper card". The
  // thumbnail is rendered inside PaperCard, which is mocked here, so it
  // can't be observed at this layer. What's left to verify at the
  // PaperList layer is that every paper given produces its own card.
  it("renders a card for every paper given", () => {
    render(
      <PaperList
        papers={[
          { ...base, id: "p1", title: "Paper One" },
          { ...base, id: "p2", title: "Paper Two" },
        ]}
        deletedPapers={[]}
        noteCounts={{}}
      />
    );
    expect(screen.getByTestId("card-p1")).toBeInTheDocument();
    expect(screen.getByTestId("card-p2")).toBeInTheDocument();
  });
});
