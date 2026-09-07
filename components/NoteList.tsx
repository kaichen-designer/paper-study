import type { Note } from "@/lib/notes/queries";

export default function NoteList({ notes }: { notes: Note[] }) {
  if (notes.length === 0) {
    return <p>尚未有筆記,選取文字或直接在下方新增第一則筆記。</p>;
  }

  return (
    <ul className="note-list">
      {notes.map((note) => (
        <li key={note.id}>
          <p>第 {note.page_number} 頁</p>
          <p>{note.strokes ? "(手寫畫記)" : note.note_text}</p>
        </li>
      ))}
    </ul>
  );
}
