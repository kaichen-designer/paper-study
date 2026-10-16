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

  describe("model fallback", () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    const busy = { ok: false, status: 503, text: async () => "overloaded" };
    const translated = {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "你好世界" }] } }] }),
    };

    it("falls back to gemini-3.6-flash with the same prompt after gemini-3.1-flash-lite exhausts 503s", async () => {
      vi.useFakeTimers();
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const fetchMock = vi.fn(async (url: string) =>
        String(url).includes("gemini-3.1-flash-lite") ? busy : translated
      );
      vi.stubGlobal("fetch", fetchMock);

      const pending = translateWithGemini({ text: "hello world", targetLang: "ZH", apiKey: "k" });
      await vi.advanceTimersByTimeAsync(20000);
      const result = await pending;

      expect(result).toEqual({ ok: true, text: "你好世界" });
      expect(fetchMock).toHaveBeenCalledTimes(6);
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      calls.slice(0, 5).forEach(([url]) => expect(url).toContain("gemini-3.1-flash-lite"));
      expect(calls[5][0]).toContain("gemini-3.6-flash");
      expect(calls[5][1].body).toBe(calls[0][1].body);
    });

    it("returns the friendly busy message when both models fail", async () => {
      vi.useFakeTimers();
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(busy));

      const pending = translateWithGemini({ text: "hello", targetLang: "ZH", apiKey: "k" });
      await vi.advanceTimersByTimeAsync(20000);
      const result = await pending;

      expect(result).toEqual({
        ok: false,
        message: "Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)",
      });
    });

    it("never touches gemini-3.6-flash when the primary model succeeds", async () => {
      const fetchMock = vi.fn().mockResolvedValue(translated);
      vi.stubGlobal("fetch", fetchMock);

      await translateWithGemini({ text: "hello", targetLang: "ZH", apiKey: "k" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).not.toContain("gemini-3.6-flash");
    });
  });
});
