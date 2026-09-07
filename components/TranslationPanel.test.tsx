import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TranslationPanel from "./TranslationPanel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TranslationPanel", () => {
  it("disables the selection-translate button when there is no selected text", () => {
    render(<TranslationPanel selectedText={null} paperId="p1" />);
    expect(screen.getByRole("button", { name: /翻譯選取範圍/ })).toBeDisabled();
  });

  it("shows the translated text in the panel without altering the selected source text, on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translatedText: "你好世界", cached: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TranslationPanel selectedText="hello world" paperId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /翻譯選取範圍/ }));

    await waitFor(() => expect(screen.getByText("你好世界")).toBeInTheDocument());
    expect(screen.getByText("hello world")).toBeInTheDocument();

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/translate");
    expect(JSON.parse(options.body)).toEqual({
      text: "hello world",
      targetLang: "ZH",
      paperId: "p1",
    });
  });

  it("shows a visible failure message and does not show a stale/empty result as if it succeeded", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "額度用罄" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TranslationPanel selectedText="hello world" paperId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /翻譯選取範圍/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("額度用罄"));
  });

  it("disables the translate-whole-page button when there is no page text available", () => {
    render(<TranslationPanel selectedText={null} pageText={null} paperId="p1" />);
    expect(screen.getByRole("button", { name: /翻譯整頁/ })).toBeDisabled();
  });

  it("translates the whole page's text (not the selection) when the translate-whole-page button is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translatedText: "整頁翻譯結果", cached: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TranslationPanel
        selectedText="hello world"
        pageText="this is the whole page text"
        paperId="p1"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /翻譯整頁/ }));

    await waitFor(() => expect(screen.getByText("整頁翻譯結果")).toBeInTheDocument());

    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      text: "this is the whole page text",
      targetLang: "ZH",
      paperId: "p1",
    });
  });
});
