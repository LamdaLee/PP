"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase";

export function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        const credentials = {
          email: String(f.get("email")),
          password: String(f.get("password")),
        };
        try {
          const db = browserClient();
          const result =
            mode === "login"
              ? await db.auth.signInWithPassword(credentials)
              : await db.auth.signUp(credentials);
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
      <button disabled={busy}>
        {mode === "login" ? "로그인" : "계정 만들기"}
      </button>
      <button
        type="button"
        className="text-button"
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
      >
        {mode === "login" ? "처음이라면 계정 만들기" : "기존 계정으로 로그인"}
      </button>
      {error && <p role="status">{error}</p>}
    </form>
  );
}
