import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listPapers, listDeletedPapers } from "@/lib/papers/queries";
import { getPaperSignedUrl } from "@/lib/papers/get-paper";
import PaperUpload from "@/components/PaperUpload";
import PaperList from "@/components/PaperList";

export default async function LibraryPage() {
  const supabase = await getSupabaseServerClient();
  const [papers, deletedPapers] = await Promise.all([
    listPapers(supabase),
    listDeletedPapers(supabase),
  ]);

  // Each card renders a thumbnail of the PDF's first page, which needs a
  // signed URL per paper (the storage bucket is private) — see
  // lib/papers/get-paper.ts for why a signed, not public, URL is required.
  const withFileUrls = async (rows: typeof papers) =>
    Promise.all(
      rows.map(async (paper) => ({
        ...paper,
        fileUrl: await getPaperSignedUrl(supabase, paper.storage_path),
      }))
    );

  // Counts back the permanent-deletion confirmation, which has to say
  // what goes with the paper.
  const { data: noteRows } = await supabase.from("notes").select("paper_id");
  const noteCounts: Record<string, number> = {};
  for (const row of noteRows ?? []) {
    const id = (row as { paper_id: string }).paper_id;
    noteCounts[id] = (noteCounts[id] ?? 0) + 1;
  }

  return (
    <main>
      <h1>我的論文庫</h1>
      <PaperUpload />
      <PaperList
        papers={await withFileUrls(papers)}
        deletedPapers={await withFileUrls(deletedPapers)}
        noteCounts={noteCounts}
      />
    </main>
  );
}
