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

  it("retries a transient error and succeeds on the second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "回應內容" }] } }] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await callGemini({ prompt: "hello", apiKey: "k", retryDeps: { sleep } });

    expect(result).toEqual({ ok: true, text: "回應內容" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("returns the existing error format after exhausting retries on a transient error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    });
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await callGemini({ prompt: "hello", apiKey: "k", retryDeps: { sleep } });

    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("503"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable error and returns immediately", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "API key invalid",
    });
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await callGemini({ prompt: "hello", apiKey: "k", retryDeps: { sleep } });

    expect(result).toEqual({ ok: false, message: expect.stringContaining("401") });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry a 429 (Gemini free-tier daily quota errors reuse the rate-limit status code, so retrying just burns more of the scarce daily allowance)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Quota exceeded for metric: generate_content_free_tier_requests",
    });
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await callGemini({ prompt: "hello", apiKey: "k", retryDeps: { sleep } });

    expect(result).toEqual({ ok: false, message: expect.stringContaining("429") });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
