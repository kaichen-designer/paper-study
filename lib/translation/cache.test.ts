import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedTranslation, saveTranslation } from "./cache";

describe("getCachedTranslation", () => {
  it("returns the cached translated text on a cache hit", async () => {
    const maybeSingleMock = vi
      .fn()
      .mockResolvedValue({ data: { translated_text: "你好" }, error: null });
    const eqLang2 = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqLang1 = vi.fn().mockReturnValue({ eq: eqLang2 });
    const eqHash = vi.fn().mockReturnValue({ eq: eqLang1 });
    const selectMock = vi.fn().mockReturnValue({ eq: eqHash });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabase = { from: fromMock } as unknown as SupabaseClient;

    const result = await getCachedTranslation(supabase, {
      textHash: "abc",
      sourceLang: "EN",
      targetLang: "ZH",
    });

    expect(fromMock).toHaveBeenCalledWith("translation_cache");
    expect(eqHash).toHaveBeenCalledWith("source_text_hash", "abc");
    expect(result).toBe("你好");
  });

  it("returns null on a cache miss instead of throwing", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqLang2 = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqLang1 = vi.fn().mockReturnValue({ eq: eqLang2 });
    const eqHash = vi.fn().mockReturnValue({ eq: eqLang1 });
    const selectMock = vi.fn().mockReturnValue({ eq: eqHash });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabase = { from: fromMock } as unknown as SupabaseClient;

    const result = await getCachedTranslation(supabase, {
      textHash: "abc",
      sourceLang: "EN",
      targetLang: "ZH",
    });

    expect(result).toBeNull();
  });
});

describe("saveTranslation", () => {
  it("upserts the translation keyed by hash + language pair", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });
    const supabase = { from: fromMock } as unknown as SupabaseClient;

    await saveTranslation(supabase, {
      textHash: "abc",
      sourceLang: "EN",
      targetLang: "ZH",
      translatedText: "你好",
      paperId: "p1",
    });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source_text_hash: "abc",
        source_lang: "EN",
        target_lang: "ZH",
        translated_text: "你好",
        paper_id: "p1",
      }),
      expect.objectContaining({ onConflict: "source_text_hash,source_lang,target_lang" })
    );
  });
});
