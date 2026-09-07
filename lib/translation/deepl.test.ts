import { afterEach, describe, expect, it, vi } from "vitest";
import { translateWithDeepL } from "./deepl";

describe("translateWithDeepL", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the translated text on a successful DeepL response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translations: [{ text: "你好世界" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateWithDeepL({
      text: "hello world",
      targetLang: "ZH",
      apiKey: "test-key",
    });

    expect(result).toEqual({ ok: true, text: "你好世界" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("api-free.deepl.com");
    expect(options.headers.Authorization).toBe("DeepL-Auth-Key test-key");
  });

  it("returns a failure result (never throws to the caller) when DeepL responds with an error status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 456,
      text: async () => "Quota exceeded",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateWithDeepL({
      text: "hello",
      targetLang: "ZH",
      apiKey: "test-key",
    });

    expect(result).toEqual({ ok: false, message: expect.stringContaining("456") });
  });

  it("returns a failure result when the network call itself throws (timeout, DNS, etc.)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateWithDeepL({
      text: "hello",
      targetLang: "ZH",
      apiKey: "test-key",
    });

    expect(result.ok).toBe(false);
  });
});
