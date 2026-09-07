import { afterEach, describe, expect, it, vi } from "vitest";
import { callGemini } from "./client";

describe("callGemini", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the generated text on a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "回應內容" }] } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callGemini({ prompt: "hello", apiKey: "test-key" });

    expect(result).toEqual({ ok: true, text: "回應內容" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(options.headers["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(options.body);
    expect(body.contents[0].parts[0].text).toBe("hello");
  });

  it("returns a failure result (never throws) on a bad HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Quota exceeded",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callGemini({ prompt: "hello", apiKey: "k" });

    expect(result).toEqual({ ok: false, message: expect.stringContaining("429") });
  });

  it("returns a failure result when the network call itself throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callGemini({ prompt: "hello", apiKey: "k" });

    expect(result.ok).toBe(false);
  });

  it("returns a failure result instead of an empty string when there are no candidates", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callGemini({ prompt: "hello", apiKey: "k" });

    expect(result.ok).toBe(false);
  });

  it("defaults to the gemini-3.6-flash model when no model is specified", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "x" }] } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await callGemini({ prompt: "hello", apiKey: "k" });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("gemini-3.6-flash");
  });

  it("calls the requested model when a model override is passed, for use cases needing lower latency", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "x" }] } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await callGemini({ prompt: "hello", apiKey: "k", model: "gemini-3.1-flash-lite" });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("gemini-3.1-flash-lite");
    expect(url).not.toContain("gemini-3.6-flash");
  });
});
