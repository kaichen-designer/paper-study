import { describe, expect, it, vi } from "vitest";
import { extractFullText } from "./extract-full-text";

function makePdfDocument(pageTexts: string[]) {
  return {
    numPages: pageTexts.length,
    getPage: vi.fn(async (pageNumber: number) => ({
      getTextContent: async () => ({
        items: [{ str: pageTexts[pageNumber - 1] }],
      }),
    })),
  };
}

describe("extractFullText", () => {
  it("includes every page's text, concatenated in page order", async () => {
    const doc = makePdfDocument(["第一頁內容", "第二頁內容", "第三頁內容"]);

    const text = await extractFullText(doc);

    const firstIndex = text.indexOf("第一頁內容");
    const secondIndex = text.indexOf("第二頁內容");
    const thirdIndex = text.indexOf("第三頁內容");
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(thirdIndex).toBeGreaterThan(secondIndex);
  });

  it("fetches every page from the document", async () => {
    const doc = makePdfDocument(["a", "b"]);

    await extractFullText(doc);

    expect(doc.getPage).toHaveBeenCalledWith(1);
    expect(doc.getPage).toHaveBeenCalledWith(2);
  });

  it("throws a clear error instead of silently swallowing a per-page failure", async () => {
    const doc = {
      numPages: 2,
      getPage: vi.fn(async (pageNumber: number) => {
        if (pageNumber === 2) throw new Error("page 2 is corrupt");
        return { getTextContent: async () => ({ items: [{ str: "ok" }] }) };
      }),
    };

    await expect(extractFullText(doc)).rejects.toThrow(/page 2 is corrupt/);
  });
});
