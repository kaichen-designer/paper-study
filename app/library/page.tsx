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
  //
  // Promise.allSettled, not Promise.all: one paper whose stored object is
  // gone (external cleanup, most likely to strike the trash first) must
  // not take down the whole page for every other paper. A failed lookup
  // gets fileUrl: null; PaperThumbnail already has a fallback for that
  // (see IMPORTANT 8).
  const withFileUrls = async (rows: typeof papers) => {
    const results = await Promise.allSettled(
      rows.map((paper) => getPaperSignedUrl(supabase, paper.storage_path))
    );
    return rows.map((paper, index) => {
      const result = results[index];
      return {
        ...paper,
        fileUrl: result.status === "fulfilled" ? result.value : null,
      };
    });
  };

  // The count is only ever shown in the permanent-deletion confirmation,
  // which is reachable only for a paper already in the trash — so only
  // those need counting. An exact head count fetches no rows at all,
  // which also puts it out of reach of the server's default row cap: a
  // truncated count here would understate what a user is about to
  // destroy irreversibly.
  //
  // A failed count is recorded as null, not 0: the confirmation dialog
  // must not tell the user a paper has zero notes when the truth is
  // "unknown" — a confident zero right before an irreversible delete is
  // worse than an honest, unquantified warning (see IMPORTANT 6).
  const noteCounts: Record<string, number | null> = {};
  await Promise.all(
    deletedPapers.map(async (paper) => {
      const { count, error } = await supabase
        .from("notes")
        .select("*", { count: "exact", head: true })
        .eq("paper_id", paper.id);
      noteCounts[paper.id] = error ? null : (count ?? 0);
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
