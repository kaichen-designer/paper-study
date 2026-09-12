import type { Note } from "@/lib/notes/queries";

export default function NoteList({ notes }: { notes: Note[] }) {
  // Stroke-based (hand-drawn) notes are already visible as ink directly on
  // the page (see components/AnnotationCanvas.tsx) — listing them here too
  // just clutters this list with one "(手寫畫記)" placeholder row per
  // stroke, with no useful text to show.
  const textNotes = notes.filter((note) => !note.strokes);

  if (textNotes.length === 0) {
    return <p>尚未有筆記,選取文字或直接在下方新增第一則筆記。</p>;
  }

  return (
    <ul className="note-list">
      {textNotes.map((note) => (
        <li key={note.id}>
          <p>第 {note.page_number} 頁</p>
          <p>{note.note_text}</p>
        </li>
      ))}
    </ul>
  );
}
