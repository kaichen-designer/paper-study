"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadPaper } from "@/lib/papers/upload";

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function PaperUpload() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!file) {
      setStatus({ kind: "error", message: "請選擇一個 PDF 檔案。" });
      return;
    }

    setStatus({ kind: "uploading" });

    const supabase = getSupabaseBrowserClient();
    const result = await uploadPaper(supabase, file, title);

    if (result.ok) {
      setStatus({ kind: "success" });
      setTitle("");
      setFile(null);
      // Re-run the library page's Server Component so the newly uploaded
      // paper appears in the list without a manual reload.
      router.refresh();
    } else {
      setStatus({ kind: "error", message: result.message });
    }
  }

  const isUploading = status.kind === "uploading";

  return (
    <form className="paper-upload-form" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="paper-title">標題</label>
        <input
          id="paper-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="paper-file">PDF 檔案</label>
        <input
          id="paper-file"
          type="file"
          accept="application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>

      <button type="submit" disabled={isUploading}>
        {isUploading ? "上傳中…" : "上傳論文"}
      </button>

      {status.kind === "success" && <p>上傳成功。</p>}
      {status.kind === "error" && <p role="alert">{status.message}</p>}
    </form>
  );
}
