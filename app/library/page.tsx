import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listPapers } from "@/lib/papers/queries";
import PaperUpload from "@/components/PaperUpload";
import PaperList from "@/components/PaperList";

export default async function LibraryPage() {
  const supabase = await getSupabaseServerClient();
  const papers = await listPapers(supabase);

  return (
    <main>
      <h1>我的論文庫</h1>
      <PaperUpload />
      <PaperList papers={papers} />
    </main>
  );
}
