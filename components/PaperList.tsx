import Link from "next/link";
import type { Paper } from "@/lib/papers/queries";

export default function PaperList({ papers }: { papers: Paper[] }) {
  if (papers.length === 0) {
    return <p>尚未上傳任何論文,使用上方表單上傳第一份 PDF 開始閱讀。</p>;
  }

  return (
    <ul className="paper-list">
      {papers.map((paper) => (
        <li key={paper.id}>
          <Link href={`/library/${paper.id}`}>{paper.title}</Link>
          {paper.finished_reading && (
            <span className="reading-status-badge">✅ 已讀完</span>
          )}
          {paper.imported_to_detabase && (
            <span className="reading-status-badge">📥 已匯入</span>
          )}
        </li>
      ))}
    </ul>
  );
}
