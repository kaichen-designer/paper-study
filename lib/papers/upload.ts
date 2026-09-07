import type { SupabaseClient } from "@supabase/supabase-js";
import { validatePdfFile } from "./validate-pdf";

const PAPERS_BUCKET = "papers";
const PAPERS_TABLE = "papers";

export type UploadPaperResult =
  | { ok: true; storagePath: string }
  | { ok: false; message: string };

/**
 * Uploads a PDF to the `papers` Storage bucket and creates the matching
 * `papers` table row.
 *
 * - Validates the file is really a PDF first (magic bytes, not just
 *   filename/MIME type) and bails out before ever touching Storage if not.
 * - Never accepts `user_id` as a parameter — it is always derived from the
 *   caller's own authenticated session via `supabase.auth.getUser()`, the
 *   same rule the rest of this app's data-access code follows.
 * - Only inserts the table row after the Storage upload has actually
 *   succeeded, so a failed upload can never leave an orphan DB record
 *   pointing at a file that doesn't exist.
 */
export async function uploadPaper(
  supabase: SupabaseClient,
  file: File,
  title: string
): Promise<UploadPaperResult> {
  const validation = await validatePdfFile(file);
  if (!validation.ok) {
    return validation;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { ok: false, message: "尚未登入,請重新登入後再試一次。" };
  }

  const userId = userData.user.id;
  const storagePath = `${userId}/${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from(PAPERS_BUCKET).upload(
    storagePath,
    file
  );
  if (uploadError) {
    return { ok: false, message: `檔案上傳失敗:${uploadError.message}` };
  }

  const { error: insertError } = await supabase.from(PAPERS_TABLE).insert({
    title,
    storage_path: storagePath,
    user_id: userId,
  });
  if (insertError) {
    return { ok: false, message: `建立論文記錄失敗:${insertError.message}` };
  }

  return { ok: true, storagePath };
}
