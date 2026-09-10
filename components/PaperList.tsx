import Link from "next/link";
import type { Paper } from "@/lib/papers/queries";
import PaperThumbnail from "./PaperThumbnail";

export type PaperWithFileUrl = Paper & { fileUrl: string };

export default function PaperList({ papers }: { papers: PaperWithFileUrl[] }) {
  if (papers.length === 0) {
    return <p>尚未上傳任何論文,使用上方表單上傳第一份 PDF 開始閱讀。</p>;
  }

  return (
    <ul className="paper-grid">
      {papers.map((paper) => (
        <li key={paper.id} className="paper-card">
          <Link href={`/library/${paper.id}`} className="paper-card-link">
            <PaperThumbnail fileUrl={paper.fileUrl} />
            <span className="paper-card-title">{paper.title}</span>
          </Link>
          {(paper.finished_reading || paper.imported_to_detabase) && (
            <div className="paper-card-badges">
              {paper.finished_reading && (
                <span className="reading-status-badge">✅ 已讀完</span>
              )}
              {paper.imported_to_detabase && (
                <span className="reading-status-badge">📥 已匯入</span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
