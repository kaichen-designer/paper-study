"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { purgePaper, renamePaper, restorePaper, softDeletePaper } from "@/lib/papers/queries";
import {
  READING_STAGES,
  STAGE_LABELS,
  setReadingStage,
  type ReadingStage,
} from "@/lib/papers/reading-stage";
import PaperThumbnail from "./PaperThumbnail";
import type { PaperWithFileUrl } from "./PaperList";

export default function PaperCard({
  paper,
  noteCount,
  onChanged,
}: {
  paper: PaperWithFileUrl;
  noteCount: number;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(paper.title);
  const [draft, setDraft] = useState(paper.title);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const removed = paper.deleted_at !== null;

  async function handleRename() {
    const supabase = getSupabaseBrowserClient();
    try {
      const updated = await renamePaper(supabase, paper.id, draft);
      setTitle(updated.title);
      setEditing(false);
      setError(null);
      onChanged();
    } catch {
      setError("標題不能是空白。");
    }
  }

  async function handleStageChange(stage: ReadingStage) {
    const supabase = getSupabaseBrowserClient();
    try {
      await setReadingStage(supabase, paper.id, stage);
      setError(null);
      onChanged();
    } catch {
      setError("階段更新失敗,請稍後再試。");
    }
  }

  async function handleRemove() {
    const supabase = getSupabaseBrowserClient();
    try {
      await softDeletePaper(supabase, paper.id);
      onChanged();
    } catch {
      setError("移至回收筒失敗,請稍後再試。");
    }
  }

  async function handleRestore() {
    const supabase = getSupabaseBrowserClient();
    try {
      await restorePaper(supabase, paper.id);
      onChanged();
    } catch {
      setError("還原失敗,請稍後再試。");
    }
  }

  async function handlePurge() {
    const supabase = getSupabaseBrowserClient();
    try {
      await purgePaper(supabase, paper);
      setConfirming(false);
      onChanged();
    } catch {
      setError("永久刪除失敗,請稍後再試。");
    }
  }

  return (
    <li className="paper-card">
      <Link href={`/library/${paper.id}`} className="paper-card-link">
        <PaperThumbnail fileUrl={paper.fileUrl} />
        {!editing && <span className="paper-card-title">{title}</span>}
      </Link>

      {editing && (
        <div className="paper-card-rename">
          <label htmlFor={`title-${paper.id}`}>論文標題</label>
          <input
            id={`title-${paper.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="button" onClick={handleRename}>
            儲存
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(title);
              setEditing(false);
            }}
          >
            取消
          </button>
        </div>
      )}

      {!removed && (
        <div className="paper-card-actions">
          <button
            type="button"
            onClick={() => {
              setDraft(title);
              setEditing(true);
            }}
          >
            重新命名
          </button>
          <label htmlFor={`stage-${paper.id}`}>閱讀階段</label>
          <select
            id={`stage-${paper.id}`}
            value={paper.reading_stage}
            onChange={(event) => handleStageChange(event.target.value as ReadingStage)}
          >
            {READING_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleRemove}>
            移至回收筒
          </button>
        </div>
      )}

      {removed && (
        <div className="paper-card-actions">
          <button type="button" onClick={handleRestore}>
            還原
          </button>
          <button type="button" onClick={() => setConfirming(true)}>
            永久刪除
          </button>
        </div>
      )}

      {confirming && (
        <div role="alertdialog" className="paper-card-confirm">
          <p>
            將永久刪除這篇論文與它的 {noteCount} 筆筆記與畫記,無法復原。
          </p>
          <button type="button" onClick={handlePurge}>
            確定永久刪除
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            取消
          </button>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
    </li>
  );
}
