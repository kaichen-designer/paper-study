import { afterEach, describe, expect, it, vi } from "vitest";
import { translateWithGemini } from "./gemini";

describe("translateWithGemini", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the translated text on a successful Gemini response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "你好世界" }] } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateWithGemini({
      text: "hello world",
      targetLang: "ZH",
      apiKey: "test-key",
    });

    expect(result).toEqual({ ok: true, text: "你好世界" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(options.headers["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(options.body);
    expect(body.contents[0].parts[0].text).toContain("hello world");
    expect(body.contents[0].parts[0].text).toContain("Traditional Chinese");
  });

  it("uses the lightweight gemini-3.1-flash-lite model so translation stays fast (gemini-3.6-flash measured 25-38s vs ~1s)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "你好" }] } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await translateWithGemini({ text: "hi", targetLang: "ZH", apiKey: "k" });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("gemini-3.1-flash-lite");
  });

  it("returns a failure result (never throws to the caller) when Gemini responds with an error status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Quota exceeded",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateWithGemini({ text: "hello", targetLang: "ZH", apiKey: "k" });

    expect(result).toEqual({ ok: false, message: expect.stringContaining("429") });
  });

  it("returns a failure result when the network call itself throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateWithGemini({ text: "hello", targetLang: "ZH", apiKey: "k" });

    expect(result.ok).toBe(false);
  });

  it("returns a failure result instead of an empty translation when Gemini's response has no candidates", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateWithGemini({ text: "hello", targetLang: "ZH", apiKey: "k" });

    expect(result.ok).toBe(false);
  });
});
