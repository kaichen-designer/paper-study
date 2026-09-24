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
  noteCount: number | null;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(paper.title);
  const [draft, setDraft] = useState(paper.title);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Seeded from the prop, then kept locally: props are a server round
  // trip behind every action here, so the select must reflect what the
  // user just chose, not what the server confirmed five hundred
  // milliseconds ago (see IMPORTANT 3).
  const [stage, setStage] = useState<ReadingStage>(paper.reading_stage);
  // One in-flight guard shared by all five write actions (rename, stage,
  // remove, restore, purge). Without it a second click before the first
  // write's round trip lands re-issues the same mutation against a row
  // that may already be gone (see BLOCKING 2).
  const [pending, setPending] = useState(false);
  const removed = paper.deleted_at !== null;

  async function handleRename() {
    setPending(true);
    const supabase = getSupabaseBrowserClient();
    try {
      const updated = await renamePaper(supabase, paper.id, draft);
      setTitle(updated.title);
      setEditing(false);
      setError(null);
      onChanged();
    } catch {
      setError("標題不能是空白。");
    } finally {
      setPending(false);
    }
  }

  async function handleStageChange(nextStage: ReadingStage) {
    const previousStage = stage;
    setStage(nextStage);
    setPending(true);
    const supabase = getSupabaseBrowserClient();
    try {
      await setReadingStage(supabase, paper.id, nextStage);
      setError(null);
      onChanged();
    } catch {
      setStage(previousStage);
      setError("階段更新失敗,請稍後再試。");
    } finally {
      setPending(false);
    }
  }

  async function handleRemove() {
    setPending(true);
    const supabase = getSupabaseBrowserClient();
    try {
      await softDeletePaper(supabase, paper.id);
      setError(null);
      onChanged();
    } catch {
      setError("移至回收筒失敗,請稍後再試。");
    } finally {
      setPending(false);
    }
  }

  async function handleRestore() {
    setPending(true);
    const supabase = getSupabaseBrowserClient();
    try {
      await restorePaper(supabase, paper.id);
      setError(null);
      onChanged();
    } catch {
      setError("還原失敗,請稍後再試。");
    } finally {
      setPending(false);
    }
  }

  async function handlePurge() {
    setPending(true);
    const supabase = getSupabaseBrowserClient();
    try {
      await purgePaper(supabase, paper);
      setConfirming(false);
      setError(null);
      onChanged();
    } catch {
      setError("永久刪除失敗,請稍後再試。");
    } finally {
      setPending(false);
    }
  }

  const thumbnailAndTitle = (
    <>
      <PaperThumbnail fileUrl={paper.fileUrl} />
      {!editing && <span className="paper-card-title">{title}</span>}
    </>
  );

  return (
    <li className="paper-card">
      {/* A removed paper is not readable — it's in the trash. Rendering
          this as a plain Link would leave a live route into the reader,
          where it could still be annotated or marked finished while
          sitting in the trash (see IMPORTANT 5). getPaperById also
          404s a removed paper's id directly, as a second layer. */}
      {removed ? (
        thumbnailAndTitle
      ) : (
        <Link href={`/library/${paper.id}`} className="paper-card-link">
          {thumbnailAndTitle}
        </Link>
      )}

      {paper.imported_to_detabase && (
        <span className="reading-status-badge">📥 已匯入</span>
      )}

      {editing && (
        <div className="paper-card-rename">
          <label htmlFor={`title-${paper.id}`}>論文標題</label>
          <input
            id={`title-${paper.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="button" onClick={handleRename} disabled={pending}>
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
            disabled={pending}
          >
            重新命名
          </button>
          <label htmlFor={`stage-${paper.id}`}>閱讀階段</label>
          <select
            id={`stage-${paper.id}`}
            value={stage}
            onChange={(event) => handleStageChange(event.target.value as ReadingStage)}
            disabled={pending}
          >
            {READING_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleRemove} disabled={pending}>
            移至回收筒
          </button>
        </div>
      )}

      {removed && (
        <div className="paper-card-actions">
          <button type="button" onClick={handleRestore} disabled={pending}>
            還原
          </button>
          <button type="button" onClick={() => setConfirming(true)} disabled={pending}>
            永久刪除
          </button>
        </div>
      )}

      {confirming && (
        <div role="alertdialog" className="paper-card-confirm">
          <p>
            將永久刪除這篇論文、
            {noteCount === null ? "它的筆記與畫記" : `它的 ${noteCount} 筆筆記與畫記`}
            ,以及所有反思對話紀錄,無法復原。
          </p>
          <button type="button" onClick={handlePurge} disabled={pending}>
            確定永久刪除
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={pending}>
            取消
          </button>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
    </li>
  );
}
