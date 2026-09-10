"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { requestMagicLink } from "@/lib/auth/request-magic-link";
import { verifyOtpCode } from "@/lib/auth/verify-otp-code";

function CallbackError() {
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  if (!callbackError) return null;
  return <p role="alert">{callbackError}</p>;
}

function VerifyCodeForm({ email }: { email: string }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "verifying" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "verifying" });

    const supabase = getSupabaseBrowserClient();
    const result = await verifyOtpCode(email, code, (args) => supabase.auth.verifyOtp(args));

    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }

    // Full navigation (not router.push) so the server picks up the
    // session cookie verifyOtp just set before /library's middleware
    // guard runs.
    window.location.href = "/library";
  }

  const isVerifying = status.kind === "verifying";

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="otp-code">信件裡的 6 位數驗證碼</label>
        <input
          id="otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
      </div>
      <button type="submit" disabled={isVerifying}>
        {isVerifying ? "驗證中…" : "驗證並登入"}
      </button>
      {status.kind === "error" && <p role="alert">{status.message}</p>}
    </form>
  );
}

function LoginForm() {
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
    <>
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
      {status.kind === "sent" && (
        <>
          <p>登入連結已寄出,請至信箱確認。</p>
          <p className="reading-status-hint">
            連結打不開(例如顯示缺少參數)?直接輸入信件裡的 6 位數驗證碼即可登入,不需要點連結。
          </p>
          <VerifyCodeForm email={email} />
        </>
      )}
      {status.kind === "error" && <p role="alert">{status.message}</p>}
      {status.kind === "idle" && (
        <Suspense fallback={null}>
          <CallbackError />
        </Suspense>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <main>
      <h1>登入 Paper Reading PWA</h1>
      <LoginForm />
    </main>
  );
}
