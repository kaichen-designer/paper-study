import { afterEach, describe, expect, it, vi } from "vitest";
import { callGemini, callGeminiWithFallback } from "./client";

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

const PRIMARY = "gemini-3.1-flash-lite";
const FALLBACK = "gemini-3.6-flash";
const BUSY_503 = "Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)";

const okResponse = (text: string) => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});
const errResponse = (status: number, body = "raw body") => ({
  ok: false,
  status,
  text: async () => body,
});

// Routes each fetch to a canned response by which model the URL targets.
function routedFetch(primary: object, fallback: object) {
  return vi.fn(async (url: string) => (String(url).includes(PRIMARY) ? primary : fallback));
}

describe("callGeminiWithFallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const run = (retryDeps: { sleep: (ms: number) => Promise<void>; now?: () => number }) =>
    callGeminiWithFallback({
      prompt: "hello",
      apiKey: "secret-key",
      primaryModel: PRIMARY,
      fallbackModel: FALLBACK,
      retryDeps,
    });

  describe("Model Fallback After Exhausted Transient Retries", () => {
    it("falls back to the second model after the primary exhausts 503 retries (6 fetches, 4 sleeps before the fallback)", async () => {
      const fetchMock = routedFetch(errResponse(503), okResponse("ok"));
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const sleep = vi.fn().mockResolvedValue(undefined);

      const result = await run({ sleep });

      expect(result).toEqual({ ok: true, text: "ok" });
      expect(fetchMock).toHaveBeenCalledTimes(6);
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      urls.slice(0, 5).forEach((url) => expect(url).toContain(PRIMARY));
      expect(urls[5]).toContain(FALLBACK);
      expect(sleep).toHaveBeenCalledTimes(4);
      expect(Math.max(...sleep.mock.invocationCallOrder)).toBeLessThan(
        fetchMock.mock.invocationCallOrder[5]
      );
    });

    it("does not touch the fallback model when the primary succeeds after a retry", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(errResponse(503))
        .mockResolvedValueOnce(okResponse("primary text"));
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const sleep = vi.fn().mockResolvedValue(undefined);

      const result = await run({ sleep });

      expect(result).toEqual({ ok: true, text: "primary text" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      fetchMock.mock.calls.forEach(([url]) => expect(String(url)).not.toContain(FALLBACK));
    });

    it.each([500, 502, 504])("falls back after the primary exhausts HTTP %i", async (status) => {
      const fetchMock = routedFetch(errResponse(status), okResponse("ok"));
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await run({ sleep: vi.fn().mockResolvedValue(undefined) });

      expect(result).toEqual({ ok: true, text: "ok" });
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it.each([
      ["HTTP 429", errResponse(429), false],
      ["HTTP 401", errResponse(401), false],
      ["HTTP 403", errResponse(403), false],
      ["HTTP 400", errResponse(400), false],
      ["HTTP 200 with no content", { ok: true, json: async () => ({ candidates: [] }) }, false],
      ["a fetch exception", null, true],
    ])("does not fall back when the primary fails with %s", async (_label, response, throws) => {
      const fetchMock = throws
        ? vi.fn().mockRejectedValue(new Error("network down"))
        : vi.fn().mockResolvedValue(response);
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const sleep = vi.fn().mockResolvedValue(undefined);

      const withFallback = await run({ sleep });
      const callsWithFallback = fetchMock.mock.calls.length;
      fetchMock.mockClear();
      const plain = await callGemini({
        prompt: "hello",
        apiKey: "secret-key",
        model: PRIMARY,
        retryDeps: { sleep },
      });

      expect(withFallback).toEqual(plain);
      expect(callsWithFallback).toBe(1);
      expect(sleep).not.toHaveBeenCalled();
      fetchMock.mock.calls.forEach(([url]) => expect(String(url)).not.toContain(FALLBACK));
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("keeps callGemini single-model: 5 attempts on 503 and a failure object with only ok and message", async () => {
      const fetchMock = vi.fn().mockResolvedValue(errResponse(503));
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const sleep = vi.fn().mockResolvedValue(undefined);

      const result = await callGemini({
        prompt: "hello",
        apiKey: "k",
        model: PRIMARY,
        retryDeps: { sleep },
      });

      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(Object.keys(result).sort()).toEqual(["message", "ok"]);
      expect(result).toEqual({ ok: false, message: BUSY_503 });
    });
  });

  describe("returns the primary model failure message when the fallback also fails", () => {
    it.each([
      ["HTTP 429", errResponse(429, "fallback quota exceeded")],
      ["HTTP 503", errResponse(503, "fallback overloaded")],
      ["HTTP 200 with no content", { ok: true, json: async () => ({ candidates: [] }) }],
    ])("fallback fails with %s", async (_label, fallbackResponse) => {
      const fetchMock = routedFetch(errResponse(503), fallbackResponse);
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await run({ sleep: vi.fn().mockResolvedValue(undefined) });

      expect(result).toEqual({ ok: false, message: BUSY_503 });
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it("fallback fetch throws", async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (String(url).includes(FALLBACK)) throw new Error("fallback boom");
        return errResponse(503);
      });
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await run({ sleep: vi.fn().mockResolvedValue(undefined) });

      expect(result).toEqual({ ok: false, message: BUSY_503 });
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it("never leaks the fallback error text into the message", async () => {
      vi.stubGlobal("fetch", routedFetch(errResponse(503), errResponse(429, "fallback-secret-body")));
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await run({ sleep: vi.fn().mockResolvedValue(undefined) });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).not.toContain("fallback-secret-body");
      expect(result.message).not.toContain("429");
    });
  });

  describe("Fallback Time Budget", () => {
    const withElapsed = (elapsed: number) => vi.fn().mockReturnValueOnce(0).mockReturnValue(elapsed);

    it.each([
      [20000, 30000],
      [25000, 30000],
      [42000, 13000],
      [47000, 8000],
    ])("with %i ms elapsed the fallback request carries a %i ms abort timeout", async (elapsed, timeout) => {
      const fetchMock = routedFetch(errResponse(503), okResponse("ok"));
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

      const result = await run({
        sleep: vi.fn().mockResolvedValue(undefined),
        now: withElapsed(elapsed),
      });

      expect(result).toEqual({ ok: true, text: "ok" });
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(timeoutSpy).toHaveBeenCalledWith(timeout);
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      expect(calls[5][1].signal).toBeDefined();
    });

    it("never attaches a timeout signal to primary-model requests", async () => {
      const fetchMock = routedFetch(errResponse(503), okResponse("ok"));
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await run({ sleep: vi.fn().mockResolvedValue(undefined), now: withElapsed(20000) });

      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      calls.slice(0, 5).forEach(([, options]) => expect(options.signal).toBeUndefined());
    });

    it.each([47001, 60000])("skips the fallback when %i ms are already elapsed", async (elapsed) => {
      const fetchMock = routedFetch(errResponse(503), okResponse("should not be used"));
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await run({
        sleep: vi.fn().mockResolvedValue(undefined),
        now: withElapsed(elapsed),
      });

      expect(result).toEqual({ ok: false, message: BUSY_503 });
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it("returns the primary failure (no throw) when the fallback request is aborted by its timeout", async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (String(url).includes(FALLBACK)) {
          throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
        }
        return errResponse(503);
      });
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await run({
        sleep: vi.fn().mockResolvedValue(undefined),
        now: withElapsed(20000),
      });

      expect(result).toEqual({ ok: false, message: BUSY_503 });
    });
  });

  describe("Fallback Decision Logging", () => {
    const joined = (spy: { mock: { calls: unknown[][] } }) =>
      spy.mock.calls.map((args) => args.join(" "));

    it("logs the switch and the fallback success with both model names", async () => {
      vi.stubGlobal("fetch", routedFetch(errResponse(503), okResponse("ok")));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await run({ sleep: vi.fn().mockResolvedValue(undefined) });

      const lines = joined(warnSpy);
      const switchLine = lines.find((l) => l.includes("falling back"));
      expect(switchLine).toBeDefined();
      for (const part of ["[callGemini]", PRIMARY, FALLBACK, "HTTP 503"]) {
        expect(switchLine).toContain(part);
      }
      const successLine = lines.find((l) => l.includes("succeeded"));
      expect(successLine).toBeDefined();
      for (const part of ["[callGemini]", "fallback", FALLBACK, PRIMARY]) {
        expect(successLine).toContain(part);
      }
    });

    it("logs a fallback failure via console.error with the model and status", async () => {
      vi.stubGlobal("fetch", routedFetch(errResponse(503), errResponse(429)));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await run({ sleep: vi.fn().mockResolvedValue(undefined) });

      const line = joined(errorSpy).find((l) => l.includes(FALLBACK) && l.includes("HTTP 429"));
      expect(line).toBeDefined();
      expect(line).toContain("[callGemini]");
    });

    it("logs a skipped fallback with the remaining budget", async () => {
      vi.stubGlobal("fetch", routedFetch(errResponse(503), okResponse("unused")));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await run({
        sleep: vi.fn().mockResolvedValue(undefined),
        now: vi.fn().mockReturnValueOnce(0).mockReturnValue(50000),
      });

      const line = joined(warnSpy).find((l) => l.includes("skipping fallback"));
      expect(line).toBeDefined();
      expect(line).toContain("[callGemini]");
      expect(line).toContain(FALLBACK);
      expect(line).toContain("5000");
    });

    it.each([
      ["the primary succeeds", okResponse("ok")],
      ["the primary returns HTTP 429", errResponse(429)],
    ])("writes no fallback log when %s", async (_label, primaryResponse) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(primaryResponse));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await run({ sleep: vi.fn().mockResolvedValue(undefined) });

      expect(joined(warnSpy).some((l) => l.includes("falling back"))).toBe(false);
    });

    it("never logs the API key or the prompt text", async () => {
      vi.stubGlobal("fetch", routedFetch(errResponse(503), errResponse(429)));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await run({ sleep: vi.fn().mockResolvedValue(undefined) });

      const all = [...joined(errorSpy), ...joined(warnSpy)].join("\n");
      expect(all).not.toContain("secret-key");
      expect(all).not.toContain("hello");
    });
  });
});
