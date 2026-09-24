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

  // The count is only ever shown in the permanent-deletion confirmation,
  // which is reachable only for a paper already in the trash — so only
  // those need counting. An exact head count fetches no rows at all,
  // which also puts it out of reach of the server's default row cap: a
  // truncated count here would understate what a user is about to
  // destroy irreversibly.
  const noteCounts: Record<string, number> = {};
  await Promise.all(
    deletedPapers.map(async (paper) => {
      const { count } = await supabase
        .from("notes")
        .select("*", { count: "exact", head: true })
        .eq("paper_id", paper.id);
      noteCounts[paper.id] = count ?? 0;
    })
  );

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
