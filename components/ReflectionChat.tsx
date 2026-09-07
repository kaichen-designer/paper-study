"use client";

import { useState } from "react";
import type { ReflectionMessage } from "@/lib/reflection/queries";

/**
 * Displays a paper's ongoing reflection conversation and lets the user
 * submit a new message at any time — not gated behind finishing the
 * paper (see design.md's "對話面板隨時可開啟" decision). Actual full-text
 * extraction and the /api/reflect call live in the parent (PaperReader),
 * passed in via `onSubmit`, so this component stays presentational.
 */
export default function ReflectionChat({
  messages,
  onSubmit,
}: {
  messages: ReflectionMessage[];
  onSubmit: (message: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;

    setStatus({ kind: "sending" });
    const result = await onSubmit(draft);

    if (result.ok) {
      setDraft("");
      setStatus({ kind: "idle" });
    } else {
      setStatus({ kind: "error", message: result.message });
    }
  }

  return (
    <section className="reflection-chat">
      <h2>心得對話</h2>
      <ul>
        {messages.map((message) => (
          <li key={message.id} data-role={message.role}>
            <p>{message.content}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit}>
        <label htmlFor="reflection-draft">心得</label>
        <textarea
          id="reflection-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={status.kind === "sending"}>
          {status.kind === "sending" ? "送出中…" : "送出"}
        </button>
      </form>
      {status.kind === "error" && <p role="alert">{status.message}</p>}
    </section>
  );
}
