import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NoteList from "./NoteList";
import type { Note } from "@/lib/notes/queries";

const note = (overrides: Partial<Note>): Note => ({
  id: "n1",
  paper_id: "p1",
  user_id: "u1",
  page_number: 1,
  position: null,
  selected_text: null,
  note_text: "預設筆記",
  created_at: "2026-08-20T00:00:00.000Z",
  ...overrides,
});

describe("NoteList", () => {
  it("renders each note's text and page number", () => {
    render(<NoteList notes={[note({ note_text: "第一則筆記", page_number: 2 })]} />);
    expect(screen.getByText("第一則筆記")).toBeInTheDocument();
    expect(screen.getByText(/第 2 頁/)).toBeInTheDocument();
  });

  it("shows a friendly empty state when there are no notes yet", () => {
    render(<NoteList notes={[]} />);
    expect(screen.getByText(/尚未有筆記/)).toBeInTheDocument();
  });

  it("shows a placeholder label for a stroke-based (hand-drawn) note instead of rendering empty text", () => {
    render(
      <NoteList
        notes={[
          note({
            note_text: null,
            strokes: [{ points: [{ x: 0.1, y: 0.1 }] }],
          }),
        ]}
      />
    );
    expect(screen.getByText("(手寫畫記)")).toBeInTheDocument();
  });
});
