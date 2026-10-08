"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";

export function Auth({ initialError = "" }: { initialError?: string }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  const [googleReady, setGoogleReady] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 8000);
    async function checkProvider() {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
          headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("인증 설정 조회 실패");
        const settings = await response.json();
        if (active) setGoogleReady(settings.external?.google === true);
      } catch {
        if (active) setGoogleReady(false);
      } finally {
        clearTimeout(timer);
      }
    }
    void checkProvider();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  async function loginWithGoogle() {
    if (busy || !googleReady) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: loginError } = await browserClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: "select_account" },
          skipBrowserRedirect: true,
        },
      });
      if (loginError) throw loginError;
      if (!data.url) throw new Error("로그인 주소를 확인하지 못했어요.");
      const destination = new URL(data.url);
      const authOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
      if (destination.origin !== authOrigin || destination.pathname !== "/auth/v1/authorize")
        throw new Error("로그인 주소를 확인하지 못했어요.");
      window.location.assign(destination.href);
    } catch {
      setError("Google 로그인을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <section className="card auth-options" aria-label="로그인 방법">
      <button type="button" className="google-login" disabled={busy || googleReady !== true} onClick={() => void loginWithGoogle()}>
        {busy ? "로그인 진행 중…" : "Google 계정으로 계속하기"}
      </button>
      <p className="hint" role="status">
        {googleReady === null ? "로그인 방법을 확인하고 있어요…" : googleReady
          ? "별도의 인증 메일 확인 없이 Google 계정으로 시작해요."
          : "Google 로그인은 준비 중이에요. 이메일 계정으로 이용할 수 있어요."}
      </p>
      {error && <p role="alert">{error}</p>}
      <details className="content-fold" open={googleReady !== true}>
        <summary>이메일·비밀번호로 로그인</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            const email = String(f.get("email"));
            const password = String(f.get("password") || "");
            try {
              const db = browserClient();
              if (mode === "forgot") {
                const result = await db.auth.resetPasswordForEmail(email, {
                  redirectTo: window.location.origin,
                });
                if (result.error) throw result.error;
                setError(
                  "재설정 메일을 보냈어요. 메일의 링크를 누른 뒤 새 비밀번호를 입력해 주세요.",
                );
                return;
              }
              const result =
                mode === "login"
                  ? await db.auth.signInWithPassword({ email, password })
                  : await db.auth.signUp({ email, password });
              if (result.error) throw result.error;
              if (mode === "signup" && !result.data.session)
                setError(
                  "확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.",
                );
            } catch (err) {
              setError(err instanceof Error ? err.message : "로그인 실패");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            이메일
            <input name="email" type="email" autoComplete="email" required />
          </label>
          {mode !== "forgot" && (
            <label>
              비밀번호
              <input
                name="password"
                type="password"
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </label>
          )}
          <button disabled={busy}>
            {mode === "login"
              ? "로그인"
              : mode === "signup"
                ? "계정 만들기"
                : "재설정 메일 보내기"}
          </button>
          {mode !== "forgot" && googleReady === false && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setError("");
                setMode(mode === "login" ? "signup" : "login");
              }}
            >
              {mode === "login" ? "처음이라면 계정 만들기" : "기존 계정으로 로그인"}
            </button>
          )}
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setError("");
              setMode(mode === "forgot" ? "login" : "forgot");
            }}
          >
            {mode === "forgot" ? "로그인으로 돌아가기" : "비밀번호를 잊으셨나요?"}
          </button>
        </form>
      </details>
    </section>
  );
}
