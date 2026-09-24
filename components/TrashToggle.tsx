"use client";

/**
 * A toggle inside the library rather than a separate route. The trash is
 * a low-traffic place people leave immediately; a route of its own would
 * need navigation, a back path and an empty state of its own, none of
 * which earn their keep at this size.
 */
export default function TrashToggle({
  showingTrash,
  onToggle,
  count,
}: {
  showingTrash: boolean;
  onToggle: () => void;
  count: number;
}) {
  return (
    <button type="button" className="trash-toggle" onClick={onToggle}>
      {showingTrash ? "回到論文庫" : `回收筒 (${count})`}
    </button>
  );
}
