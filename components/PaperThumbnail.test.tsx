import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {}, version: "test" },
  Document: ({
    children,
    onLoadSuccess,
    onLoadError,
    file,
  }: {
    children: React.ReactNode;
    onLoadSuccess?: (result: { numPages: number }) => void;
    onLoadError?: (error: Error) => void;
    file: string;
  }) => {
    if (file === "/papers/broken.pdf") {
      onLoadError?.(new Error("failed to load"));
      return null;
    }
    onLoadSuccess?.({ numPages: 5 });
    return <div data-testid="document">{children}</div>;
  },
  Page: ({ pageNumber, width }: { pageNumber: number; width?: number }) => (
    <div data-testid="page" data-page-number={pageNumber} data-width={width ?? ""} />
  ),
}));

import PaperThumbnail from "./PaperThumbnail";

describe("PaperThumbnail", () => {
  it("renders only the first page of the PDF, at a small thumbnail width", () => {
    render(<PaperThumbnail fileUrl="/papers/example.pdf" />);
    const page = screen.getByTestId("page");
    expect(page).toHaveAttribute("data-page-number", "1");
    expect(Number(page.getAttribute("data-width"))).toBeLessThanOrEqual(200);
  });

  it("falls back to the app icon when the PDF fails to load", () => {
    render(<PaperThumbnail fileUrl="/papers/broken.pdf" />);
    expect(screen.queryByTestId("page")).not.toBeInTheDocument();
    expect(screen.getByTestId("paper-thumbnail-fallback")).toHaveAttribute(
      "src",
      "/icon-192.png"
    );
  });
});
