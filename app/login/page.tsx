"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { requestMagicLink } from "@/lib/auth/request-magic-link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "sent" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    const result = await requestMagicLink(email, (args) => supabase.auth.signInWithOtp(args));

    setStatus(result.ok ? { kind: "sent" } : { kind: "error", message: result.message });
  }

  return (
    <main>
      <h1>登入 Paper Reading PWA</h1>
      <form className="login-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <button type="submit">寄送登入連結</button>
      </form>
      {status.kind === "sent" && <p>登入連結已寄出,請至信箱確認。</p>}
      {status.kind === "error" && <p role="alert">{status.message}</p>}
    </main>
  );
}
