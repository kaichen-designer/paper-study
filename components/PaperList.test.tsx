import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PaperList from "./PaperList";
import type { Paper } from "@/lib/papers/queries";

const paper = (overrides: Partial<Paper>): Paper => ({
  id: "p1",
  user_id: "u1",
  title: "Attention Is All You Need",
  storage_path: "u1/attention.pdf",
  uploaded_at: "2026-08-20T00:00:00.000Z",
  metadata: {},
  reached_last_page: false,
  finished_reading: false,
  finished_at: null,
  imported_to_detabase: false,
  ...overrides,
});

describe("PaperList", () => {
  it("renders each paper's title", () => {
    render(<PaperList papers={[paper({ id: "p1", title: "Paper One" })]} />);
    expect(screen.getByText("Paper One")).toBeInTheDocument();
  });

  it("shows a friendly empty state when there are no papers yet", () => {
    render(<PaperList papers={[]} />);
    expect(screen.getByText(/尚未上傳/)).toBeInTheDocument();
  });

  it("links each paper to its reading view by id", () => {
    render(<PaperList papers={[paper({ id: "abc-123", title: "Paper One" })]} />);
    expect(screen.getByRole("link", { name: "Paper One" })).toHaveAttribute(
      "href",
      "/library/abc-123"
    );
  });

  it("shows no status badge when a paper has neither reached its last page nor been marked finished", () => {
    render(
      <PaperList
        papers={[paper({ reached_last_page: false, finished_reading: false, imported_to_detabase: false })]}
      />
    );
    expect(screen.queryByText("✅ 已讀完")).not.toBeInTheDocument();
    expect(screen.queryByText("📥 已匯入")).not.toBeInTheDocument();
  });

  it("shows no status badge when a paper has reached its last page but is not yet marked finished", () => {
    render(
      <PaperList
        papers={[paper({ reached_last_page: true, finished_reading: false, imported_to_detabase: false })]}
      />
    );
    expect(screen.queryByText("✅ 已讀完")).not.toBeInTheDocument();
    expect(screen.queryByText("📥 已匯入")).not.toBeInTheDocument();
  });

  it("shows only the finished badge when a paper is marked finished but not yet imported", () => {
    render(
      <PaperList
        papers={[paper({ reached_last_page: true, finished_reading: true, imported_to_detabase: false })]}
      />
    );
    expect(screen.getByText("✅ 已讀完")).toBeInTheDocument();
    expect(screen.queryByText("📥 已匯入")).not.toBeInTheDocument();
  });

  it("shows both the finished and imported badges when a paper has been imported", () => {
    render(
      <PaperList
        papers={[paper({ reached_last_page: true, finished_reading: true, imported_to_detabase: true })]}
      />
    );
    expect(screen.getByText("✅ 已讀完")).toBeInTheDocument();
    expect(screen.getByText("📥 已匯入")).toBeInTheDocument();
  });
});
