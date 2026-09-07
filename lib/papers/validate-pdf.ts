const PDF_MAGIC_BYTES = "%PDF-";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB — personal tool, no chunked upload.

export type ValidatePdfResult = { ok: true } | { ok: false; message: string };

/**
 * Reads a Blob's bytes via FileReader rather than `Blob.prototype.arrayBuffer()`.
 * FileReader has universal support across target browsers (incl. iPad
 * Safari) and — unlike `arrayBuffer()` — is implemented by jsdom, so the
 * same code path runs under both real browsers and the test suite.
 */
function readAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Validates that a File is actually a PDF before it is ever uploaded.
 *
 * Deliberately does NOT trust `file.type` (browser-supplied MIME type) or
 * the filename extension — both are trivially spoofable by a caller. The
 * only signal trusted here is the file's own leading bytes, which must
 * match the `%PDF-` magic-byte signature every PDF file starts with.
 */
export async function validatePdfFile(file: File): Promise<ValidatePdfResult> {
  if (file.size === 0) {
    return { ok: false, message: "檔案是空的,請選擇有效的 PDF 檔案。" };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, message: "檔案過大(上限 50MB),請選擇較小的 PDF 檔案。" };
  }

  const headerBytes = await readAsArrayBuffer(file.slice(0, PDF_MAGIC_BYTES.length));
  const header = new TextDecoder("utf-8").decode(headerBytes);

  if (header !== PDF_MAGIC_BYTES) {
    return {
      ok: false,
      message: "這不是有效的 PDF 檔案(檔案內容缺少 PDF 簽章),請確認檔案未毀損或副檔名未被竄改。",
    };
  }

  return { ok: true };
}
