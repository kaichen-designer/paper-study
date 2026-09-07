"use client";

import { useState } from "react";

export default function NoteForm({
  pageNumber,
  selectedText,
  onSubmitNote,
}: {
  pageNumber: number;
  selectedText: string | null;
  onSubmitNote: (input: { pageNumber: number; selectedText: string | null; noteText: string }) => void;
}) {
  const [noteText, setNoteText] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!noteText.trim()) return;

    onSubmitNote({ pageNumber, selectedText, noteText });
    setNoteText("");
  }

  return (
    <form className="note-form" onSubmit={handleSubmit}>
      <h2>筆記</h2>
      {selectedText && <p>選取範圍:{selectedText}</p>}
      <label htmlFor="note-text">筆記內容</label>
      <textarea
        id="note-text"
        value={noteText}
        onChange={(event) => setNoteText(event.target.value)}
      />
      <button type="submit">新增筆記</button>
    </form>
  );
}
