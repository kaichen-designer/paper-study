import { describe, expect, it } from "vitest";
import { validatePdfFile } from "./validate-pdf";

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes], name, { type });
}

describe("validatePdfFile", () => {
  it("accepts a file whose content starts with the %PDF- magic bytes", async () => {
    const pdfBytes = new TextEncoder().encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj\n<< >>\nendobj");
    const file = makeFile(pdfBytes, "paper.pdf", "application/pdf");

    const result = await validatePdfFile(file);

    expect(result).toEqual({ ok: true });
  });

  it("rejects a plain-text .txt file with a clear message", async () => {
    const textBytes = new TextEncoder().encode("This is a plain text file, not a PDF.");
    const file = makeFile(textBytes, "notes.txt", "text/plain");

    const result = await validatePdfFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/pdf/i);
    }
  });

  it("rejects a file renamed to .pdf with a spoofed MIME type but no real PDF signature", async () => {
    // Scoundrel case: malicious caller can freely control both filename
    // extension and file.type, so validation must not trust either.
    const textBytes = new TextEncoder().encode("not actually a pdf, just relabeled");
    const file = makeFile(textBytes, "totally-a-paper.pdf", "application/pdf");

    const result = await validatePdfFile(file);

    expect(result.ok).toBe(false);
  });

  it("rejects an empty file", async () => {
    const file = makeFile(new Uint8Array(0), "empty.pdf", "application/pdf");

    const result = await validatePdfFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/empty|空/i);
    }
  });

  it("rejects a file larger than the 50MB size cap", async () => {
    const MAX_BYTES = 50 * 1024 * 1024;
    const oversized = new Uint8Array(MAX_BYTES + 1);
    oversized.set(new TextEncoder().encode("%PDF-1.4"));
    const file = makeFile(oversized, "big.pdf", "application/pdf");

    const result = await validatePdfFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/50\s*MB|太大/i);
    }
  });
});
