"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { RoutineManager, RoutineToday, useRoutines } from "./Routines";
import { Brand } from "./Brand";
import { Auth } from "./Auth";
import { EntryForm } from "./EntryForm";
import { ScheduleForm } from "./ScheduleForm";
import { BreatheModal } from "./BreatheModal";
import { CoolingOffBox } from "./CoolingOffBox";
import { browserClient } from "@/lib/supabase";
import {
  koreaDate,
  monthRange,
  sumLedger,
  scheduleOccurrences,
} from "@/lib/finance.mjs";
import type { Data, Fragment, Memo } from "@/lib/types";

const blank: Data = { memos: [], entries: [], schedules: [], settlements: [] };
const labels: Record<string, string> = {
  money: "돈",
  thought: "생각",
  emotion: "감정",
  work: "일",
  breathe: "숨고르기",
  income: "수입",
  expense: "지출",
  refund: "환불",
  repayment: "대금·상환",
  transfer: "이체",
  cash: "현금",
  debit: "체크카드",
  credit: "신용카드",
  account: "계좌",
};

const won = (n: number) => new Intl.NumberFormat("ko-KR").format(n) + "원";

export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [data, setData] = useState<Data>(blank),
    [page, setPage] = useState("inbox"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [sync, setSync] = useState("연결 준비"),
    [text, setText] = useState(() => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("pp_draft_text") || "";
      }
      return "";
    }),
    [breathing, setBreathing] = useState(false);

  const [month, setMonth] = useState(() => koreaDate().slice(0, 7)),
    [range, setRange] = useState(() => monthRange(koreaDate().slice(0, 7))),
    [candidate, setCandidate] = useState<{
      memo: Memo;
      fragment: Fragment;
    } | null>(null);

  const memoRequest = useRef({ text: "", id: "" });
  const currentUser = useRef<string | null>(null);
  const reloadCount = useRef(0);
  const routineController = useRoutines(session?.user.id || null);
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Auto-save web draft to localStorage
  useEffect(() => {
    if (text) {
      localStorage.setItem("pp_draft_text", text);
    } else {
      localStorage.removeItem("pp_draft_text");
    }
  }, [text]);

  async function reload() {
    const sequence = ++reloadCount.current;
    const db = browserClient();
    const {
      data: { session: s },
    } = await db.auth.getSession();
    if (!s) return;
    const user = s.user.id;
    const r = await fetch(`/api/data?month=${month}&limit=50`, {
      headers: { Authorization: `Bearer ${s.access_token}` },
      cache: "no-store",
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    if (currentUser.current === user && sequence === reloadCount.current)
      setData(d);
  }

  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }
    const db = browserClient();
    let alive = true;
    db.auth.getSession().then(({ data: { session: s } }) => {
      if (alive) {
        setSession(s);
        currentUser.current = s?.user.id || null;
        setReady(true);
      }
    });
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_, s) => {
      setSession(s);
      currentUser.current = s?.user.id || null;
      if (!s) setData(blank);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    if (!session) return;
    let timer: NodeJS.Timeout;
    const update = () =>
      reload()
        .then(() => {
          setSync("동기화됨");
          setError("");
        })
        .catch((e) => setSync(e.message));
    const db = browserClient();
    const channel = db.channel("pp-realtime");
    for (const table of ["memos", "entries", "schedules", "settlements"])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          clearTimeout(timer);
          timer = setTimeout(update, 200);
        },
      );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setSync("실시간 연결됨");
        update();
      } else if (status === "CHANNEL_ERROR") {
        setSync("재연결 중");
      }
    });
    const online = () => {
      setSync("온라인 · 동기화 중");
      update();
    };
    const visible = () => {
      if (document.visibilityState === "visible") update();
    };
    const offline = () => setSync("오프라인 · 저장 대기");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      channel.unsubscribe();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [session, month]);

  async function send(body: unknown) {
    const db = browserClient();
    const {
      data: { session: s },
    } = await db.auth.getSession();
    if (!s) throw Error("로그인이 필요합니다.");
    const r = await fetch("/api/data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    return d;
  }

  async function action(fn: () => Promise<string | void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const message = await fn();
      await reload();
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업에 실패했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveMemo() {
    const body = text.trim();
    if (!body) return;
    if (memoRequest.current.text !== body)
      memoRequest.current = { text: body, id: crypto.randomUUID() };
    return action(async () => {
      const result = await send({
        action: "memo",
        requestId: memoRequest.current.id,
        text: body,
      });
      memoRequest.current = { text: "", id: "" };
      setText("");
      localStorage.removeItem("pp_draft_text");
      const pending = (result.fragments || []).filter(
        (f: Fragment) => f.status === "pending",
      ).length;
      return pending
        ? `저장 완료 · 확인이 필요한 항목이 ${pending}개 있습니다.`
        : "생각함에 남겼습니다.";
    });
  }

  const rows = data.entries.filter(
    (e) =>
      e.occurred_on >= range.start && e.occurred_on <= range.end && !e.voided_at,
  );
  const ledger = sumLedger(rows);
  const due = data.schedules
    .flatMap((s) => scheduleOccurrences(s, koreaDate(), data.settlements))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const nav = [
    { id: "inbox", label: "생각함" },
    { id: "money", label: "돈" },
    { id: "cooling", label: "충동 보류함" },
    { id: "routines", label: "루틴" },
    { id: "work", label: "일" },
    { id: "emotion", label: "감정" },
    { id: "breathe", label: "숨고르기" },
  ];

  if (!ready) {
    return (
      <div className="layout">
        <Brand />
        <p>시작하는 중...</p>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="layout">
        <Brand />
        <div className="card">
          <h2>Supabase 설정이 필요합니다</h2>
          <p>
            Vercel 또는 환경변수에 <code>NEXT_PUBLIC_SUPABASE_URL</code>과{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>를 등록해 주세요.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="layout">
        <Brand />
        <Auth />
      </div>
    );
  }

  function memoCards(category?: string) {
    const list = data.memos.filter(
      (m) =>
        !category ||
        (m.fragments || []).some((f) => f.categories?.includes(category as any)),
    );
    if (!list.length) return <p className="hint">아직 남겨둔 메모가 없어요.</p>;
    return (
      <div className="memos-list">
        {list.map((m) => (
          <article key={m.id} className="card">
            <time>{m.created_at.slice(0, 10)}</time>
            <p className="memo-body">{m.body}</p>
            <div className="chips">
              {(m.fragments || []).map((f) => (
                <span key={f.id} className={`chip chip-${f.status}`}>
                  {f.text}
                  {f.amount ? ` · ${won(f.amount)}` : ""}
                  {f.status === "pending" && (
                    <button
                      type="button"
                      className="inline-link"
                      onClick={() => setCandidate({ memo: m, fragment: f })}
                    >
                      확인
                    </button>
                  )}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="layout">
      <header className="header">
        <Brand />
        <nav className="nav">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => setPage(n.id)}
            >
              {n.label}
            </button>
          ))}
          <button
            type="button"
            className="text-button"
            onClick={() => browserClient().auth.signOut()}
          >
            로그아웃
          </button>
        </nav>
        <span className="sync-pill" title="동기화 상태">
          {sync}
        </span>
      </header>

      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <main className="main">
        {/* INBOX TAB */}
        {page === "inbox" && (
          <>
            <section className="card compose">
              <h2>생각함</h2>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="21000원 우산 구매&#10;떠오른 생각이나 할 일, 감정도 편하게 적어두세요."
                rows={4}
              />
              <div className="actions">
                <button disabled={busy || !text.trim()} onClick={saveMemo}>
                  남겨두기
                </button>
              </div>
            </section>
            <RoutineToday controller={routineController} />
            {memoCards()}
          </>
        )}

        {/* COOLING OFF BOX TAB */}
        {page === "cooling" && (
          <CoolingOffBox
            onConvertToExpense={async (item) => {
              await send({
                action: "entry",
                requestId: crypto.randomUUID(),
                title: item.title,
                kind: "expense",
                amount: item.amount,
                date: koreaDate(),
                method: "credit",
              });
              await reload();
            }}
          />
        )}

        {/* MONEY TAB */}
        {page === "money" && (
          <>
            <section className="card ledger-summary">
              <div className="month-picker">
                <label>
                  조회 기간
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => {
                      setMonth(e.target.value);
                      try {
                        setRange(monthRange(e.target.value));
                      } catch {}
                    }}
                  />
                </label>
              </div>
              <div className="summary-grid">
                <div>
                  <span>수입</span>
                  <b>+{won(ledger.income)}</b>
                </div>
                <div>
                  <span>소비</span>
                  <b className="expense">-{won(ledger.expense)}</b>
                </div>
                <div>
                  <span>환불</span>
                  <b>+{won(ledger.refund)}</b>
                </div>
                <div>
                  <span>상환</span>
                  <b>{won(ledger.repayment)}</b>
                </div>
                <div className="net">
                  <span>소비 차액</span>
                  <b>
                    {ledger.net >= 0 ? "+" : ""}
                    {won(ledger.net)}
                  </b>
                </div>
              </div>
            </section>

            <EntryForm
              candidate={candidate}
              busy={busy}
              onCancel={() => setCandidate(null)}
              onSave={(body) =>
                action(async () => {
                  await send(body);
                  setCandidate(null);
                  return "기록 완료";
                })
              }
            />

            <ScheduleForm
              busy={busy}
              onSave={(body) =>
                action(async () => {
                  await send(body);
                  return "일정을 추가했습니다.";
                })
              }
            />

            <section className="card">
              <h3>{month} 거래 내역 ({rows.length}건)</h3>
              {rows.length === 0 ? (
                <p className="hint">이번 달 거래 내역이 없습니다.</p>
              ) : (
                <ul className="entries-list">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <span>{r.occurred_on}</span>
                      <b>{r.title}</b>
                      <span>{labels[r.kind] || r.kind}</span>
                      <span className={r.kind === "expense" ? "expense" : ""}>
                        {r.kind === "expense" ? "-" : "+"}
                        {won(r.amount)}
                      </span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          action(async () => {
                            await send({ action: "void", id: r.id });
                            return "거래를 취소했습니다.";
                          })
                        }
                      >
                        취소
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {/* ROUTINES TAB */}
        {page === "routines" && (
          <RoutineManager controller={routineController} />
        )}

        {/* WORK TAB */}
        {page === "work" && (
          <>
            <h2>일 관련 메모</h2>
            {memoCards("work")}
          </>
        )}

        {/* EMOTION TAB */}
        {page === "emotion" && (
          <>
            <h2>감정 기록</h2>
            {memoCards("emotion")}
          </>
        )}

        {/* BREATHE TAB */}
        {page === "breathe" && (
          <>
            <section className="card">
              <h2>숨고르기</h2>
              <p>마음이 조급하거나 충동이 일어날 때 잠시 멈춥니다.</p>
              <button onClick={() => setBreathing(true)}>지금 호흡하기</button>
            </section>
            {memoCards("breathe")}
          </>
        )}
      </main>

      <button className="pause" onClick={() => setBreathing(true)}>
        Ⅱ 잠깐 숨고르기
      </button>

      {breathing && <BreatheModal onClose={() => setBreathing(false)} />}
    </div>
  );
}
