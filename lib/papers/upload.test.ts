import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadPaper } from "./upload";

function makePdfFile(name = "paper.pdf"): File {
  const bytes = new TextEncoder().encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj\n<< >>\nendobj");
  return new File([bytes], name, { type: "application/pdf" });
}

function makeTxtFile(name = "notes.txt"): File {
  const bytes = new TextEncoder().encode("just some plain text, not a PDF");
  return new File([bytes], name, { type: "text/plain" });
}

function makeMockSupabase(overrides?: {
  uploadResult?: { data: { path: string } | null; error: { message: string } | null };
  insertResult?: { error: { message: string } | null };
  userResult?: {
    data: { user: { id: string } | null };
    error: { message: string } | null;
  };
}) {
  const callOrder: string[] = [];

  const uploadMock = vi.fn(async () => {
    callOrder.push("upload");
    return overrides?.uploadResult ?? { data: { path: "user-1/abc-paper.pdf" }, error: null };
  });

  const insertMock = vi.fn(async () => {
    callOrder.push("insert");
    return overrides?.insertResult ?? { error: null };
  });

  const getUserMock = vi.fn(async () => {
    return overrides?.userResult ?? { data: { user: { id: "user-1" } }, error: null };
  });

  const fromStorageMock = vi.fn(() => ({ upload: uploadMock }));
  const fromTableMock = vi.fn(() => ({ insert: insertMock }));

  const supabase = {
    auth: { getUser: getUserMock },
    storage: { from: fromStorageMock },
    from: fromTableMock,
  } as unknown as SupabaseClient;

  return {
    supabase,
    uploadMock,
    insertMock,
    getUserMock,
    fromStorageMock,
    fromTableMock,
    callOrder,
  };
}

describe("uploadPaper", () => {
  it("validates, uploads to the papers storage bucket, then inserts a papers row, in that order", async () => {
    const { supabase, uploadMock, insertMock, fromStorageMock, fromTableMock, callOrder } =
      makeMockSupabase();
    const file = makePdfFile();

    const result = await uploadPaper(supabase, file, "My Paper");

    expect(result.ok).toBe(true);

    expect(fromStorageMock).toHaveBeenCalledWith("papers");
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [uploadPath, uploadedFile] = uploadMock.mock.calls[0];
    expect(uploadPath).toMatch(/^user-1\/.+-paper\.pdf$/);
    expect(uploadedFile).toBe(file);

    expect(fromTableMock).toHaveBeenCalledWith("papers");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "My Paper",
        storage_path: uploadPath,
        user_id: "user-1",
      })
    );

    // Storage upload must complete before the table row is inserted, so we
    // never end up with a DB record pointing at a file that failed to land.
    expect(callOrder).toEqual(["upload", "insert"]);
  });

  it("rejects a non-PDF file without calling storage upload or insert at all", async () => {
    const { supabase, uploadMock, insertMock } = makeMockSupabase();
    const file = makeTxtFile();

    const result = await uploadPaper(supabase, file, "Not a paper");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/pdf/i);
    }
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("does not insert a papers row when the storage upload fails (no orphan DB record)", async () => {
    const { supabase, insertMock } = makeMockSupabase({
      uploadResult: { data: null, error: { message: "network error" } },
    });
    const file = makePdfFile();

    const result = await uploadPaper(supabase, file, "My Paper");

    expect(result.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("never accepts a caller-supplied user_id — it always derives the id from auth.getUser()", async () => {
    const { supabase, insertMock, getUserMock } = makeMockSupabase({
      userResult: { data: { user: { id: "real-authenticated-user" } }, error: null },
    });
    const file = makePdfFile();

    // Note: uploadPaper's signature takes only (supabase, file, title) —
    // there is no user_id parameter to pass even if a caller wanted to.
    await uploadPaper(supabase, file, "My Paper");

    expect(getUserMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "real-authenticated-user" })
    );
  });
});
