import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listPapers } from "@/lib/papers/queries";
import { getPaperSignedUrl } from "@/lib/papers/get-paper";
import PaperUpload from "@/components/PaperUpload";
import PaperList from "@/components/PaperList";

export default async function LibraryPage() {
  const supabase = await getSupabaseServerClient();
  const papers = await listPapers(supabase);
  // Each card renders a thumbnail of the PDF's first page, which needs a
  // signed URL per paper (the storage bucket is private) — see
  // lib/papers/get-paper.ts for why a signed, not public, URL is required.
  const papersWithFileUrls = await Promise.all(
    papers.map(async (paper) => ({
      ...paper,
      fileUrl: await getPaperSignedUrl(supabase, paper.storage_path),
    }))
  );

  return (
    <main>
      <h1>我的論文庫</h1>
      <PaperUpload />
      <PaperList papers={papersWithFileUrls} />
    </main>
  );
}
