import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getPaperById, getPaperSignedUrl } from "@/lib/papers/get-paper";
import { listNotesForPaper } from "@/lib/notes/queries";
import { listReflectionMessages } from "@/lib/reflection/queries";
import PaperReader from "./PaperReader";

export default async function PaperPage({ params }: { params: { id: string } }) {
  const supabase = await getSupabaseServerClient();
  const paper = await getPaperById(supabase, params.id);

  if (!paper) {
    notFound();
  }

  const [fileUrl, notes, reflectionMessages] = await Promise.all([
    getPaperSignedUrl(supabase, paper.storage_path),
    listNotesForPaper(supabase, paper.id),
    listReflectionMessages(supabase, paper.id),
  ]);

  return (
    <main>
      <Link href="/library" className="back-to-library">
        ← 回到論文庫
      </Link>
      <h1>{paper.title}</h1>
      <PaperReader
        fileUrl={fileUrl}
        paperId={paper.id}
        initialNotes={notes}
        initialReflectionMessages={reflectionMessages}
        initialReachedLastPage={paper.reached_last_page}
        initialFinishedReading={paper.finished_reading}
        initialImportedToDetabase={paper.imported_to_detabase}
      />
    </main>
  );
}
