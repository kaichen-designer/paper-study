import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({}),
}));

const uploadPaperMock = vi.fn();
vi.mock("@/lib/papers/upload", () => ({
  uploadPaper: (...args: unknown[]) => uploadPaperMock(...args),
}));

import PaperUpload from "./PaperUpload";

describe("PaperUpload", () => {
  it("renders a title input, a PDF file input, and a submit button", () => {
    render(<PaperUpload />);

    const titleInput = screen.getByLabelText("標題") as HTMLInputElement;
    expect(titleInput).toBeInTheDocument();
    expect(titleInput.type).toBe("text");

    const fileInput = screen.getByLabelText("PDF 檔案") as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput.type).toBe("file");

    expect(screen.getByRole("button", { name: /上傳/ })).toBeInTheDocument();
  });

  it("refreshes the server-fetched paper list after a successful upload, so the new paper appears without a manual reload", async () => {
    uploadPaperMock.mockResolvedValue({ ok: true, storagePath: "u1/x.pdf" });
    render(<PaperUpload />);

    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "My Paper" } });
    const file = new File(["%PDF-1.4"], "x.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("PDF 檔案"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /上傳/ }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("does not refresh the paper list when the upload fails", async () => {
    refreshMock.mockClear();
    uploadPaperMock.mockResolvedValue({ ok: false, message: "檔案上傳失敗" });
    render(<PaperUpload />);

    fireEvent.change(screen.getByLabelText("標題"), { target: { value: "My Paper" } });
    const file = new File(["%PDF-1.4"], "x.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("PDF 檔案"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /上傳/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("檔案上傳失敗"));
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
