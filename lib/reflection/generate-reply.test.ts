import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReflectionReply } from "./generate-reply";

function makeSupabaseStub() {
  return {} as unknown as SupabaseClient;
}

describe("generateReflectionReply", () => {
  it("sends a prompt containing the paper's full text and the user's message to the provider", async () => {
    const provider = vi.fn().mockResolvedValue({ ok: true, text: "AI 回應內容" });
    const saveMessage = vi.fn().mockResolvedValue({ id: "m1" });

    await generateReflectionReply({
      supabase: makeSupabaseStub(),
      paperId: "p1",
      paperFullText: "這篇論文討論了 XYZ 主題的重要發現",
      conversationHistory: [],
      userMessage: "我覺得這篇論文在講 ABC",
      apiKey: "key",
      deps: { provider, saveMessage },
    });

    const [callArgs] = provider.mock.calls[0];
    expect(callArgs.prompt).toContain("這篇論文討論了 XYZ 主題的重要發現");
    expect(callArgs.prompt).toContain("我覺得這篇論文在講 ABC");
  });

  it("saves the user message then the assistant reply, in that order, on success", async () => {
    const provider = vi.fn().mockResolvedValue({ ok: true, text: "AI 回應內容" });
    const saveMessage = vi.fn().mockResolvedValue({ id: "m1" });

    const result = await generateReflectionReply({
      supabase: makeSupabaseStub(),
      paperId: "p1",
      paperFullText: "全文",
      conversationHistory: [],
      userMessage: "心得",
      apiKey: "key",
      deps: { provider, saveMessage },
    });

    expect(saveMessage).toHaveBeenNthCalledWith(1, expect.anything(), {
      paperId: "p1",
      role: "user",
      content: "心得",
    });
    expect(saveMessage).toHaveBeenNthCalledWith(2, expect.anything(), {
      paperId: "p1",
      role: "assistant",
      content: "AI 回應內容",
    });
    expect(result).toEqual({ ok: true, reply: "AI 回應內容" });
  });

  it("does not save anything when the provider call fails", async () => {
    const provider = vi.fn().mockResolvedValue({ ok: false, message: "額度用罄" });
    const saveMessage = vi.fn();

    const result = await generateReflectionReply({
      supabase: makeSupabaseStub(),
      paperId: "p1",
      paperFullText: "全文",
      conversationHistory: [],
      userMessage: "心得",
      apiKey: "key",
      deps: { provider, saveMessage },
    });

    expect(saveMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: "額度用罄" });
  });

  it("includes prior conversation history in the prompt so the AI has context of earlier turns", async () => {
    const provider = vi.fn().mockResolvedValue({ ok: true, text: "回應" });
    const saveMessage = vi.fn().mockResolvedValue({ id: "m2" });

    await generateReflectionReply({
      supabase: makeSupabaseStub(),
      paperId: "p1",
      paperFullText: "全文",
      conversationHistory: [
        { role: "user", content: "第一次心得" },
        { role: "assistant", content: "第一次回應" },
      ],
      userMessage: "第二次心得",
      apiKey: "key",
      deps: { provider, saveMessage },
    });

    const [callArgs] = provider.mock.calls[0];
    expect(callArgs.prompt).toContain("第一次心得");
    expect(callArgs.prompt).toContain("第一次回應");
    expect(callArgs.prompt).toContain("第二次心得");
  });
});
