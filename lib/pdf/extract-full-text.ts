export type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{ getTextContent: () => Promise<unknown> }>;
};

/**
 * Extracts the full text of a PDF document across all pages, concatenated
 * in page order. Used once, on demand, when a user opens the reflection
 * chat panel (not on every page load) — see design.md.
 */
export async function extractFullText(pdfDocument: PdfDocumentProxy): Promise<string> {
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = (await page.getTextContent()) as { items?: { str?: string }[] };
    const pageText = (textContent.items ?? []).map((item) => item.str ?? "").join(" ");
    pageTexts.push(pageText);
  }

  return pageTexts.join("\n\n");
}
