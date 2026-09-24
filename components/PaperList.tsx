"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Paper } from "@/lib/papers/queries";
import { READING_STAGES, STAGE_LABELS } from "@/lib/papers/reading-stage";
import PaperCard from "./PaperCard";
import TrashToggle from "./TrashToggle";

export type PaperWithFileUrl = Paper & { fileUrl: string | null };

// A missing entry (paper not counted, e.g. it isn't in the trash) still
// defaults to 0 — noteCount is only ever displayed for a removed paper's
// purge confirmation. An explicit `null` (the count failed to load) must
// survive this lookup rather than being coalesced away, so `??` (which
// treats null and undefined alike) is deliberately not used here.
function lookupNoteCount(noteCounts: Record<string, number | null>, paperId: string): number | null {
  const value = noteCounts[paperId];
  return value === undefined ? 0 : value;
}

export default function PaperList({
  papers,
  deletedPapers,
  noteCounts,
}: {
  papers: PaperWithFileUrl[];
  deletedPapers: PaperWithFileUrl[];
  noteCounts: Record<string, number | null>;
}) {
  const router = useRouter();
  const [showingTrash, setShowingTrash] = useState(false);
  // The server component owns the data; refreshing re-runs it rather
  // than duplicating the paper list in client state.
  const refresh = () => router.refresh();

  if (showingTrash) {
    return (
      <>
        <TrashToggle showingTrash onToggle={() => setShowingTrash(false)} count={deletedPapers.length} />
        {deletedPapers.length === 0 ? (
          <p>回收筒是空的。</p>
        ) : (
          <ul className="paper-grid">
            {deletedPapers.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                noteCount={lookupNoteCount(noteCounts, paper.id)}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </>
    );
  }

  if (papers.length === 0) {
    return (
      <>
        <TrashToggle showingTrash={false} onToggle={() => setShowingTrash(true)} count={deletedPapers.length} />
        {deletedPapers.length === 0 ? (
          <p>尚未上傳任何論文,使用上方表單上傳第一份 PDF 開始閱讀。</p>
        ) : (
          <p>所有論文都在回收筒裡。點上方的回收筒查看或還原。</p>
        )}
      </>
    );
  }

  return (
    <>
      <TrashToggle showingTrash={false} onToggle={() => setShowingTrash(true)} count={deletedPapers.length} />
      {READING_STAGES.map((stage) => {
        const inStage = papers.filter((paper) => paper.reading_stage === stage);
        // An empty stage renders nothing at all: a heading over no cards
        // reads as a fault rather than as an empty category.
        if (inStage.length === 0) return null;
        return (
          <section key={stage} className="paper-stage-group">
            <h2>{STAGE_LABELS[stage]}</h2>
            <ul className="paper-grid">
              {inStage.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  noteCount={lookupNoteCount(noteCounts, paper.id)}
                  onChanged={refresh}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
