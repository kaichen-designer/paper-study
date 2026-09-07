import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NoteForm from "./NoteForm";

describe("NoteForm", () => {
  it("submits the note text along with the current page and selected text", () => {
    const onSubmitNote = vi.fn();
    render(<NoteForm pageNumber={3} selectedText="an excerpt" onSubmitNote={onSubmitNote} />);

    fireEvent.change(screen.getByLabelText("筆記內容"), { target: { value: "這裡很重要" } });
    fireEvent.click(screen.getByRole("button", { name: /新增筆記/ }));

    expect(onSubmitNote).toHaveBeenCalledWith({
      pageNumber: 3,
      selectedText: "an excerpt",
      noteText: "這裡很重要",
    });
  });

  it("does not submit an empty note", () => {
    const onSubmitNote = vi.fn();
    render(<NoteForm pageNumber={1} selectedText={null} onSubmitNote={onSubmitNote} />);

    fireEvent.click(screen.getByRole("button", { name: /新增筆記/ }));

    expect(onSubmitNote).not.toHaveBeenCalled();
  });
});
