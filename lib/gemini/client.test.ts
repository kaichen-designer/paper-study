import { afterEach, describe, expect, it, vi } from "vitest";
import { callGemini } from "./client";

describe("callGemini", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    const [firstDelay] = sleep.mock.calls[0];
    expect(firstDelay).toBeGreaterThanOrEqual(1000);
    expect(firstDelay).toBeLessThan(1500);
  });

  it("retries up to 4 times with 1s/2s/4s/8s backoff, then returns the friendly busy message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await callGemini({ prompt: "hello", apiKey: "k", retryDeps: { sleep } });

    expect(result).toEqual({
      ok: false,
      message: "Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledTimes(4);
    [1000, 2000, 4000, 8000].forEach((base, i) => {
      const [delay] = sleep.mock.calls[i];
      expect(delay).toBeGreaterThanOrEqual(base);
      expect(delay).toBeLessThan(base + 500);
    });
    const total = sleep.mock.calls.reduce((sum, [ms]) => sum + (ms as number), 0);
    expect(total).toBeGreaterThanOrEqual(15000);
    expect(total).toBeLessThan(17000);
  });

  it("succeeds when the last allowed (5th) attempt finally returns content", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "" })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "" })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "" })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await callGemini({ prompt: "hello", apiKey: "k", retryDeps: { sleep } });

    expect(result).toEqual({ ok: true, text: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledTimes(4);
  });

  it("does not expose the raw Gemini error body in the message, only in the server log", async () => {
    const rawBody =
      '{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => rawBody,
    });
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await callGemini({ prompt: "hello", apiKey: "k", retryDeps: { sleep } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).not.toContain("overloaded");
    expect(result.message).not.toContain("UNAVAILABLE");
    expect(result.message).not.toContain("{");
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).toContain(rawBody);
  });

  it.each([
    [429, "Gemini 的使用額度或請求頻率已達上限,請稍後再試。(HTTP 429)"],
    [403, "Gemini API 金鑰無效或沒有權限,請檢查伺服器設定。(HTTP 403)"],
    [400, "Gemini 回應錯誤,請稍後再試。(HTTP 400)"],
  ])("maps HTTP %i to its friendly message", async (status, expected) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: async () => "raw body",
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await callGemini({ prompt: "hello", apiKey: "k" });

    expect(result).toEqual({ ok: false, message: expected });
  });

  it("returns the friendly network message after a single attempt when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET secret-detail"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await callGemini({ prompt: "hello", apiKey: "k", retryDeps: { sleep } });

    expect(result).toEqual({
      ok: false,
      message: "無法連線至 Gemini,請檢查網路連線後再試一次。",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("keeps the 'no content' message for a 200 response without text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callGemini({ prompt: "hello", apiKey: "k" });

    expect(result).toEqual({ ok: false, message: "Gemini 回應中沒有內容。" });
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

    expect(result).toEqual({
      ok: false,
      message: "Gemini API 金鑰無效或沒有權限,請檢查伺服器設定。(HTTP 401)",
    });
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

    expect(result).toEqual({
      ok: false,
      message: "Gemini 的使用額度或請求頻率已達上限,請稍後再試。(HTTP 429)",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
