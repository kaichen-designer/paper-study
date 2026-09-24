"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const THUMBNAIL_WIDTH = 160;

/**
 * A small, non-interactive preview of a paper's first PDF page, used as its
 * library card cover. Falls back to the app icon if the PDF can't be
 * loaded (e.g. an expired signed URL or a corrupt file) so one broken paper
 * never breaks the whole grid.
 */
export default function PaperThumbnail({ fileUrl }: { fileUrl: string | null }) {
  const [failed, setFailed] = useState(false);

  // A null fileUrl means the signed URL request itself failed (e.g. the
  // stored object is missing) — there is nothing to hand react-pdf, so
  // go straight to the same fallback used for a load failure (IMPORTANT 8).
  if (failed || fileUrl === null) {
    return (
      <img
        src="/icon-192.png"
        alt=""
        data-testid="paper-thumbnail-fallback"
        className="paper-card-thumbnail-fallback"
      />
    );
  }

  return (
    <div className="paper-card-thumbnail">
      <Document file={fileUrl} onLoadError={() => setFailed(true)} loading={null} error={null}>
        <Page
          pageNumber={1}
          width={THUMBNAIL_WIDTH}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
    </div>
  );
}
