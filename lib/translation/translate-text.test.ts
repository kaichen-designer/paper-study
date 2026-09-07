import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { translateText } from "./translate-text";

function makeSupabaseStub() {
  return {} as unknown as SupabaseClient;
}

describe("translateText", () => {
  it("returns the cached result and does not call the translation provider on a cache hit", async () => {
    const getCached = vi.fn().mockResolvedValue("快取的翻譯");
    const saveCache = vi.fn();
    const provider = vi.fn();

    const result = await translateText({
      supabase: makeSupabaseStub(),
      text: "the model achieves 95% accuracy",
      sourceLang: "EN",
      targetLang: "ZH",
      apiKey: "key",
      deps: { getCached, saveCache, provider },
    });

    expect(provider).not.toHaveBeenCalled();
    expect(saveCache).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, text: "快取的翻譯", cached: true });
  });

  it("calls the provider and caches the result on a cache miss", async () => {
    const getCached = vi.fn().mockResolvedValue(null);
    const saveCache = vi.fn().mockResolvedValue(undefined);
    const provider = vi.fn().mockResolvedValue({ ok: true, text: "新的翻譯" });

    const result = await translateText({
      supabase: makeSupabaseStub(),
      text: "a fresh sentence",
      sourceLang: "EN",
      targetLang: "ZH",
      apiKey: "key",
      paperId: "p1",
      deps: { getCached, saveCache, provider },
    });

    expect(provider).toHaveBeenCalledWith({ text: "a fresh sentence", targetLang: "ZH", apiKey: "key" });
    expect(saveCache).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceLang: "EN",
        targetLang: "ZH",
        translatedText: "新的翻譯",
        paperId: "p1",
      })
    );
    expect(result).toEqual({ ok: true, text: "新的翻譯", cached: false });
  });

  it("surfaces a visible failure and does not cache anything when the provider call fails", async () => {
    const getCached = vi.fn().mockResolvedValue(null);
    const saveCache = vi.fn();
    const provider = vi.fn().mockResolvedValue({ ok: false, message: "額度用罄" });

    const result = await translateText({
      supabase: makeSupabaseStub(),
      text: "a fresh sentence",
      sourceLang: "EN",
      targetLang: "ZH",
      apiKey: "key",
      deps: { getCached, saveCache, provider },
    });

    expect(saveCache).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: "額度用罄" });
  });
});
