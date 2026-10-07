"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { RoutineManager, useRoutines } from "./Routines";
import { Brand } from "./Brand";
import { Auth } from "./Auth";
import { EntryForm } from "./EntryForm";
import { ScheduleForm } from "./ScheduleForm";
import { BreatheModal } from "./BreatheModal";
import { CoolingOffBox, coolingFromRow, type CoolingItem } from "./CoolingOffBox";
import { browserClient } from "@/lib/supabase";
import {
  koreaDate,
  monthRange,
  sumLedger,
  scheduleOccurrences,
} from "@/lib/finance.mjs";
import type { Data, Fragment, Memo } from "@/lib/types";

const blank: Data = {
  memos: [],
  entries: [],
  schedules: [],
  settlements: [],
  totals: null,
  monthTotals: null,
  entriesTruncated: false,
  memosTruncated: false,
};
const labels: Record<string, string> = {
  money: "가계부",
  purchase: "갖고 싶음",
  thought: "그대로",
  emotion: "감정",
  work: "할 일",
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
    [text, setText] = useState(""),
    [breathing, setBreathing] = useState(false),
    [recovery, setRecovery] = useState(false),
    [cooling, setCooling] = useState<CoolingItem[]>([]),
    [draftReady, setDraftReady] = useState(false),
    [pieceFilter, setPieceFilter] = useState("all"),
    [heart, setHeart] = useState<"write" | "pieces" | "emotion">("write"),
    [memoQuery, setMemoQuery] = useState(""),
    [editingId, setEditingId] = useState<string | null>(null),
    [editText, setEditText] = useState(""),
    [entryEdit, setEntryEdit] = useState<{
      id: string;
      title: string;
      kind: string;
      amount: string;
      date: string;
      method: string;
    } | null>(null),
    [scheduleEdit, setScheduleEdit] = useState<{
      id: string;
      title: string;
      amount: string;
    } | null>(null);

  const [month, setMonth] = useState(() => koreaDate().slice(0, 7)),
    [range, setRange] = useState(() => monthRange(koreaDate().slice(0, 7))),
    [candidate, setCandidate] = useState<{
      memo: Memo;
      fragment: Fragment;
    } | null>(null);

  const memoRequest = useRef({ text: "", id: "" });
  const coolingMoved = useRef(false);
  const currentUser = useRef<string | null>(null);
  const reloadCount = useRef(0);
  const routineController = useRoutines(session?.user.id || null);
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Auto-save web draft to localStorage
  useEffect(() => {
    const saved = localStorage.getItem("pp_draft_text");
    if (saved) setText(saved);
    setDraftReady(true);
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    if (text) localStorage.setItem("pp_draft_text", text);
    else localStorage.removeItem("pp_draft_text");
  }, [text, draftReady]);

  async function reload() {
    const sequence = ++reloadCount.current;
    const db = browserClient();
    const {
      data: { session: s },
    } = await db.auth.getSession();
    if (!s) return;
    const user = s.user.id;
    const r = await fetch(
      `/api/data?from=${encodeURIComponent(range.start)}&to=${encodeURIComponent(range.end)}`,
      {
        headers: { Authorization: `Bearer ${s.access_token}` },
        cache: "no-store",
      },
    );
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    if (currentUser.current === user && sequence === reloadCount.current) {
      const seen = new Set<string>();
      const memos = (d.memos || []).filter((memo: Memo) => {
        if (!memo?.id || seen.has(memo.id)) return false;
        seen.add(memo.id);
        return true;
      });
      setData({ ...blank, ...d, memos });
      setCooling((d.cooling || []).map(coolingFromRow));
    }
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
    } = db.auth.onAuthStateChange((event, s) => {
      setSession(s);
      currentUser.current = s?.user.id || null;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (!s) {
        setData(blank);
        setCooling([]);
        setRecovery(false);
      }
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<ReturnType<typeof browserClient>["channel"]> | null =
      null;
    const db = browserClient();
    const update = () =>
      reload()
        .then(() => {
          if (!stopped) {
            setSync("동기화됨");
            setError("");
          }
        })
        .catch((e) => {
          if (!stopped) setSync(e.message);
        });
    const listen = async () => {
      if (stopped) return;
      const {
        data: { session: live },
      } = await db.auth.getSession();
      if (stopped || !live) return;
      await db.realtime.setAuth(live.access_token);
      if (channel) db.removeChannel(channel);
      channel = db.channel(`account-${live.user.id}`);
      for (const table of [
        "memos",
        "entries",
        "schedules",
        "settlements",
        "cooling_off_items",
      ])
        channel = channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `user_id=eq.${live.user.id}`,
          },
          () => {
            clearTimeout(timer);
            timer = setTimeout(update, 200);
          },
        );
      channel.subscribe((status) => {
        if (stopped) return;
        if (status === "SUBSCRIBED") {
          setSync("실시간 연결됨");
          update();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSync("재연결 중");
          if (channel) db.removeChannel(channel);
          channel = null;
          clearTimeout(retry);
          retry = setTimeout(listen, 2000);
        }
      });
    };
    void listen();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") update();
    }, 4000);
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
      stopped = true;
      clearTimeout(timer);
      clearTimeout(retry);
      clearInterval(poll);
      if (channel) db.removeChannel(channel);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [session, range.start, range.end]);

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
  useEffect(() => {
    if (!session || coolingMoved.current || sync !== "동기화됨") return;
    const raw = localStorage.getItem("pp_cooling_off_items");
    coolingMoved.current = true;
    if (!raw) return;
    let local: CoolingItem[] = [];
    try {
      local = JSON.parse(raw);
    } catch {
      return;
    }
    const ids = new Set(cooling.map((item) => item.id));
    const missing = local.filter((item) => item?.id && !ids.has(item.id));
    if (!missing.length) {
      localStorage.removeItem("pp_cooling_off_items");
      return;
    }
    void (async () => {
      try {
        for (const item of missing) await send({ action: "cooling", item });
        localStorage.removeItem("pp_cooling_off_items");
        await reload();
      } catch {
        coolingMoved.current = false;
      }
    })();
  }, [session, sync, cooling]);

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
    if (data.memos.some((memo) => memo.body.trim() === body)) {
      if (!window.confirm("같은 말을 이미 마음함에 두었어요. 한번 더 둘까요?"))
        return;
    }
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
      const fragments: Fragment[] = result.fragments || [];
      const buys = fragments.filter((f) => f.intent === "buy");
      for (const fragment of buys) {
        await send({
          action: "cooling",
          item: {
            id: crypto.randomUUID(),
            title: (fragment.item || fragment.text).slice(0, 200),
            amount: fragment.amount,
            reason: fragment.text,
            emotion: "충동",
            coolDownHours: 24,
            status: "cooling",
          },
        });
      }
      if (buys.length) setPage("cooling");
      else if (fragments.some((f) => f.intent === "eat")) setPage("money");
      const pending = fragments.filter((f) => f.status === "pending").length;
      if (buys.length) return "사고 싶은 건 잠깐 두기로 옮겼어요.";
      if (fragments.some((f) => f.intent === "eat"))
        return "먹고 싶은 건 갖고 싶음으로만 연결했어요. 가계부에는 넣지 않았어요.";
      if (pending) return "금액은 바로 넣지 않고, 가계부에서 한번 더 볼게요.";
    });
  }

  async function updateMemo(id: string) {
    const body = editText.trim();
    if (!body) return;
    const ok = await action(async () => {
      await send({ action: "memo-update", id, text: body });
    });
    if (ok) setEditingId(null);
  }

  async function removeMemo(id: string) {
    if (!window.confirm("이 메모를 지울까요? 이미 가계부에 넣은 금액은 그대로 남아요."))
      return;
    await action(async () => {
      await send({ action: "memo-delete", id });
    });
  }

  const today = koreaDate();
  const rows = data.entries.filter(
    (e) =>
      e.occurred_on >= range.start && e.occurred_on <= range.end && !e.voided_at,
  );
  const totals = data.totals ?? sumLedger(rows);
  const onceTasks = data.memos.flatMap((memo) =>
    (memo.fragments || [])
      .filter((fragment) => fragment.categories?.includes("work"))
      .map((fragment) => ({ memo, fragment })),
  );
  const due = data.schedules
    .flatMap((s) => scheduleOccurrences(s, today, data.settlements))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  async function finishTask(memoId: string, fragmentId: string, done: boolean) {
    await action(async () => {
      await send({ action: "memo-done", id: memoId, fragmentId, done });
    });
  }

  const nav: [string, string][] = [
    ["inbox", "마음함"],
    ["cooling", "잠깐 두기"],
    ["money", "가계부"],
    ["daily", "일상"],
    ["breathe", "숨고르기"],
  ];

  if (!ready) {
    return (
      <div className="auth">
        <Brand />
        <p>시작하는 중…</p>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="auth">
        <Brand />
        <div className="card">
          <h2>설정 필요</h2>
          <p>
            Vercel 또는 환경변수에 <code>NEXT_PUBLIC_SUPABASE_URL</code>과{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>를 추가해 주세요.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth">
        <Brand />
        <h1>잠시 멈추고, 온전히 바라보기</h1>
        <p>복잡하게 적지 않아도 괜찮아요. 마음함에 두면 가계부, 감정, 일상으로 이어집니다.</p>
        <Auth />
      </div>
    );
  }

  function fragmentNotes(memo: Memo, fragment: Fragment, showText: boolean) {
    return (
      <div key={`${memo.id}-${fragment.id}`}>
        {showText && <p>{fragment.text}</p>}
        {fragment.item && fragment.intent && (
          <p className="hint">
            {fragment.intent === "buy" ? "사고 싶은 것" : "먹고 싶은 것"} ·{" "}
            {fragment.item}
          </p>
        )}
        <span className="tags">
          {fragment.categories.map((c) => labels[c] || c).join(" · ")}
          {fragment.amount ? ` · ${won(fragment.amount)}` : ""}
        </span>
        <span className="status">
          {fragment.status === "posted"
            ? "기록됨"
            : fragment.status === "pending"
              ? "확인 필요"
              : "메모"}
        </span>
        {fragment.intent === "buy" && (
          <button
            type="button"
            className="text-button"
            onClick={() => setPage("cooling")}
          >
            잠깐 두기로
          </button>
        )}
        {fragment.status === "pending" && (
          <button
            type="button"
            className="text-button"
            onClick={() => setCandidate({ memo, fragment })}
          >
            확인하고 가계부에 넣기
          </button>
        )}
      </div>
    );
  }
  function memoCards(category?: string, extra?: (memo: Memo) => ReactNode) {
    const query = memoQuery.trim();
    const list = data.memos.filter(
      (m) =>
        (!query || m.body.includes(query)) &&
        (!category ||
          (m.fragments || []).some((f) => f.categories?.includes(category))),
    );
    if (!list.length) return <p className="empty">아직 남겨둔 메모가 없어요.</p>;
    return (
      <div className="fragments">
        {list.map((m) => {
          const pieces = m.fragments || [];
          const repeated =
            pieces.length === 1 && pieces[0].text.trim() === m.body.trim();
          const editing = editingId === m.id;
          return (
            <div key={m.id} className="card">
              <time>{m.created_at.slice(0, 10)}</time>
              {editing ? (
                <>
                  <label className="sr-only" htmlFor={`edit-${m.id}`}>
                    메모 고치기
                  </label>
                  <textarea
                    id={`edit-${m.id}`}
                    value={editText}
                    maxLength={10000}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  <div className="memo-actions">
                    <button
                      type="button"
                      disabled={busy || !editText.trim()}
                      onClick={() => void updateMemo(m.id)}
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setEditingId(null)}
                    >
                      취소
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="original">{m.body}</p>
                  <div>
                    {pieces.map((f) => fragmentNotes(m, f, !repeated))}
                  </div>
                  <div className="memo-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setEditingId(m.id);
                        setEditText(m.body);
                      }}
                    >
                      고치기
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => void removeMemo(m.id)}
                    >
                      지우기
                    </button>
                  </div>
                  {extra?.(m)}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const dueCards = (
    <div className="card apricot">
      <p className="eyebrow">예정된 일정</p>
      <h2>{due.length ? `${due.length}건 남음` : "모두 완료"}</h2>
      {due.slice(0, 3).map((s) => (
        <div className="due" key={s.id + s.due_date}>
          <div>
            <b>{s.title}</b>
            <small>
              {s.due_date} · {labels[s.kind] || s.kind}
              {s.overdue ? " · 지난 일정" : ""}
            </small>
          </div>
          <strong>{won(s.amount)}</strong>
          <button
            disabled={busy}
            onClick={() => {
              action(async () => {
                await send({
                  action: "settle",
                  id: s.id,
                  due: s.due_date,
                  requestId: crypto.randomUUID(),
                });
              });
            }}
          >
            완료 기록
          </button>
        </div>
      ))}
      {!due.length && <p>예정된 일정이 없어요.</p>}
    </div>
  );

  return (
    <div className="shell">
      <aside>
        <Brand />
        <nav aria-label="주 메뉴">
          {nav.map(([id, name]) => (
            <button
              key={id}
              className={page === id ? "selected" : ""}
              onClick={() => {
                if (id === "inbox") setHeart("write");
                setPage(id);
              }}
            >
              {name}
            </button>
          ))}
        </nav>
        <small>{session.user.email}</small>
        <button
          className="text-button"
          onClick={() => browserClient().auth.signOut()}
        >
          로그아웃
        </button>
      </aside>

      <main>
        <header>
          <div>
            <p className="eyebrow">조금씩, 나의 속도로</p>
            <h1>{nav.find((n) => n[0] === page)?.[1]}</h1>
          </div>
          <div className="header-actions">
            <span className="sync" role="status">
              {sync}
            </span>
            <button
              className="text-button"
              onClick={() => browserClient().auth.signOut()}
            >
              로그아웃
            </button>
          </div>
        </header>

        {recovery && (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const password = String(new FormData(e.currentTarget).get("password"));
              void action(async () => {
                const { error: resetError } =
                  await browserClient().auth.updateUser({ password });
                if (resetError) throw resetError;
                setRecovery(false);
                return "비밀번호를 바꿨어요.";
              });
            }}
          >
            <h2>새 비밀번호</h2>
            <p>메일 링크로 들어왔어요. 앞으로 쓸 비밀번호를 입력해 주세요.</p>
            <label>
              새 비밀번호
              <input
                name="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            <button disabled={busy}>비밀번호 저장</button>
          </form>
        )}

        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}

        {/* 1. INBOX TAB */}
        {page === "inbox" && (
          <>
            <div className="form-row" role="tablist" aria-label="마음함">
              {(
                [
                  ["write", "둔 말"],
                  ["pieces", "조각"],
                  ["emotion", "감정"],
                ] as const
              ).map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={heart === id}
                  className={heart === id ? "selected" : "secondary"}
                  onClick={() => setHeart(id)}
                >
                  {name}
                </button>
              ))}
            </div>
            {heart === "write" && (
          <>
            <section className="card capture">
              <h2>지금 떠오르는 것을 놓아두세요.</h2>
              <p>정리하지 않아도 괜찮아요. 마음함에 맞게 나눠 둘게요.</p>
              <label className="sr-only" htmlFor="dump">
                생각 메모
              </label>
              <textarea
                id="dump"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void saveMemo();
                  }
                }}
                placeholder={
                  "21000원 우산 구매\n오늘은 조금 불안해. 보고서 작성해야 해."
                }
                maxLength={10000}
              />
              <div className="capture-footer">
                <small>
                  쓰는 동안에는 나누지 않아요. Enter는 줄바꿈이고, 완료하면
                  정리해요.
                </small>
                <button disabled={busy || !text.trim()} onClick={saveMemo}>
                  {busy ? "저장 중…" : "완료"}
                </button>
              </div>
            </section>

            <div className="grid">
              <div className="card butter">
                <p className="eyebrow">이번 달 소비</p>
                <h2>{won(data.monthTotals?.expense ?? 0)}</h2>
                <p>대금·상환과 예정 금액은 따로 표시해요.</p>
                <button
                  className="text-button"
                  onClick={() => setPage("money")}
                >
                  가계부 살펴보기 →
                </button>
              </div>
              {dueCards}
            </div>

            <button className="text-button" onClick={() => setPage("daily")}>
              일상에서 할 일 확인하기 →
            </button>

            <h2 className="section-heading">마음함에 둔 말</h2>
            <label>
              찾기
              <input
                value={memoQuery}
                onChange={(e) => setMemoQuery(e.target.value)}
                placeholder="적어 둔 말"
              />
            </label>
            {data.memosTruncated && (
              <p className="hint">오래된 메모 일부는 아직 이 화면에 없어요.</p>
            )}
            {memoCards()}
          </>
            )}

        {heart === "pieces" && (
          <section className="card">
            <h2>나뉜 메모</h2>
            <p>완료한 뒤에 나뉜 조각을 여기서 다시 볼 수 있어요.</p>
            <div className="form-row">
              {(
                [
                  ["all", "전체"],
                  ["purchase", "갖고 싶음"],
                  ["money", "가계부"],
                  ["emotion", "감정"],
                  ["work", "할 일"],
                  ["breathe", "숨고르기"],
                  ["thought", "그대로"],
                ] as const
              ).map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  className={pieceFilter === id ? "selected" : "secondary"}
                  onClick={() => setPieceFilter(id)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="fragments">
              {data.memos.flatMap((memo) =>
                (memo.fragments || [])
                  .filter(
                    (fragment) =>
                      pieceFilter === "all" ||
                      fragment.categories.includes(pieceFilter),
                  )
                  .map((fragment) => (
                    <div className="card" key={`${memo.id}-${fragment.id}`}>
                      <time>{memo.created_at.slice(0, 10)}</time>
                      {fragmentNotes(memo, fragment, true)}
                      <div className="memo-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setHeart("write");
                            setEditingId(memo.id);
                            setEditText(memo.body);
                          }}
                        >
                          고치기
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() => void removeMemo(memo.id)}
                        >
                          지우기
                        </button>
                      </div>
                    </div>
                  )),
              )}
            </div>
          </section>
        )}

            {heart === "emotion" && (
              <>
                <section className="card apricot">
                  <h2>감정</h2>
                  <p>
                    감정으로 나뉜 말이에요. 같은 날의 가계부 소비를 옆에 두지만,
                    그 감정이 소비의 이유라고 보지 않아요.
                  </p>
                </section>
                {memoCards("emotion", (memo) => {
                  const day = memo.created_at.slice(0, 10);
                  const spent = data.entries
                    .filter(
                      (entry) =>
                        entry.occurred_on === day &&
                        !entry.voided_at &&
                        entry.kind === "expense",
                    )
                    .reduce((sum, entry) => sum + entry.amount, 0);
                  return (
                    <p className="hint">
                      {day} 가계부 소비 {won(spent)}
                    </p>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* 2. COOLING OFF BOX TAB (NEW) */}
        {page === "cooling" && (
          <>
            <section className="card butter">
              <h2>사고 싶다고 한 것</h2>
              {data.memos.some((memo) =>
                (memo.fragments || []).some(
                  (fragment) =>
                    fragment.intent === "buy" &&
                    !cooling.some(
                      (item) => item.title === (fragment.item || fragment.text),
                    ),
                ),
              ) ? (
                data.memos.flatMap((memo) =>
                  (memo.fragments || [])
                    .filter(
                      (fragment) =>
                        fragment.intent === "buy" &&
                        !cooling.some(
                          (item) =>
                            item.title === (fragment.item || fragment.text),
                        ),
                    )
                    .map((fragment) => (
                      <div key={`${memo.id}-${fragment.id}`}>
                        <b>{fragment.item || fragment.text}</b>
                        <p className="hint">
                          {fragment.amount
                            ? won(fragment.amount)
                            : "금액은 아직 없어요. 아래에서 적으면 보류 시간이 시작돼요."}
                        </p>
                      </div>
                    )),
                )
              ) : (
                <p className="hint">새로 사고 싶다고 한 물건이 없어요.</p>
              )}
            </section>
            <CoolingOffBox
            items={cooling}
            onSave={async (item) =>
              !!(await action(async () => {
                await send({ action: "cooling", item });
              }))
            }
            onConvertToExpense={async (item) => {
              const ok = await action(async () => {
                await send({
                  action: "entry",
                  requestId: crypto.randomUUID(),
                  title: item.title,
                  kind: "expense",
                  amount: item.amount,
                  date: koreaDate(),
                  method: "credit",
                });
              });
              if (!ok) throw Error("가계부 기록을 저장하지 못했습니다.");
            }}
            />
          </>
        )}

        {/* 3. ROUTINES TAB */}
        {page === "daily" && (
          <>
            <section className="card">
              <h2>오늘 확인할 일</h2>
              <p>한 번 할 일과 반복할 일을 여기서 함께 확인해요.</p>
            </section>
            <section className="card">
              <h2>한 번 할 일</h2>
              {onceTasks.filter((task) => !task.fragment.done).length ? (
                onceTasks
                  .filter((task) => !task.fragment.done)
                  .map((task) => (
                    <div className="due" key={`${task.memo.id}-${task.fragment.id}`}>
                      <div>
                        <b>{task.fragment.text}</b>
                        <small>{task.memo.created_at.slice(0, 10)}</small>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void finishTask(task.memo.id, task.fragment.id, true)
                        }
                      >
                        끝냈어요
                      </button>
                    </div>
                  ))
              ) : (
                <p className="hint">지금 남은 한 번 할 일이 없어요.</p>
              )}
              {onceTasks.some((task) => task.fragment.done) && (
                <>
                  <h3>끝낸 일</h3>
                  {onceTasks
                    .filter((task) => task.fragment.done)
                    .map((task) => (
                      <div
                        className="due"
                        key={`done-${task.memo.id}-${task.fragment.id}`}
                      >
                        <div>
                          <b>{task.fragment.text}</b>
                        </div>
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void finishTask(
                              task.memo.id,
                              task.fragment.id,
                              false,
                            )
                          }
                        >
                          되돌리기
                        </button>
                      </div>
                    ))}
                </>
              )}
            </section>
            <RoutineManager controller={routineController} />
          </>
        )}

        {/* 4. MONEY TAB */}
        {page === "money" && (
          <>
            <section className="card">
              <h2>언제부터 언제까지</h2>
              <div className="form-row">
                <label>
                  월 선택
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => {
                      setMonth(e.target.value);
                      if (e.target.value) setRange(monthRange(e.target.value));
                    }}
                  />
                </label>
                <label>
                  시작
                  <input
                    type="date"
                    value={range.start}
                    onChange={(e) =>
                      setRange({ ...range, start: e.target.value })
                    }
                  />
                </label>
                <label>
                  끝
                  <input
                    type="date"
                    value={range.end}
                    min={range.start}
                    onChange={(e) =>
                      setRange({ ...range, end: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="totals">
                <div>
                  <small>수입</small>
                  <strong>{won(totals.income)}</strong>
                </div>
                <div>
                  <small>소비</small>
                  <strong>{won(totals.expense)}</strong>
                </div>
                <div>
                  <small>환불</small>
                  <strong>{won(totals.refund)}</strong>
                </div>
                <div>
                  <small>대금·상환</small>
                  <strong>{won(totals.repayment)}</strong>
                </div>
              </div>
              <p className="hint">
                소비 차액 {won(totals.net)} = 수입 + 환불 − 소비. 은행 잔액이
                아니에요. 카드 구매는 소비, 카드 대금 납부는 대금·상환으로
                기록합니다. 합계는 선택한 기간의 전체 기록으로 계산해요.
              </p>
              {data.entriesTruncated && (
                <p className="hint">
                  내역이 너무 많아 목록 일부만 보여요. 합계에는 모두 포함됩니다.
                </p>
              )}
            </section>

            <h2 className="section-heading">갖고 싶음으로 연결된 메모</h2>
            <p className="hint">
              먹고 싶다, 사고 싶다, 구매하고 싶다는 가계부에 넣지 않아요. 사고
              싶다는 잠깐 두기로 옮겨요.
            </p>
            {memoCards("purchase")}

            <EntryForm
              candidate={candidate}
              busy={busy}
              onCancel={() => setCandidate(null)}
              onSave={(body) =>
                action(async () => {
                  await send(body);
                  setCandidate(null);
                })
              }
            />

            <section className="card">
              <h2>가계부 내역</h2>
              {rows
                .filter((e) => !e.voided_at)
                .map((e) =>
                  entryEdit?.id === e.id ? (
                    <form
                      className="due"
                      key={e.id}
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!entryEdit) return;
                        void action(async () => {
                          await send({
                            action: "entry-revise",
                            id: entryEdit.id,
                            title: entryEdit.title,
                            kind: entryEdit.kind,
                            amount: Number(entryEdit.amount),
                            date: entryEdit.date,
                            method: entryEdit.method,
                          });
                          setEntryEdit(null);
                        });
                      }}
                    >
                      <input
                        value={entryEdit.title}
                        maxLength={500}
                        onChange={(event) =>
                          setEntryEdit({
                            ...entryEdit,
                            title: event.target.value,
                          })
                        }
                        aria-label="이름"
                      />
                      <input
                        type="number"
                        min="1"
                        value={entryEdit.amount}
                        onChange={(event) =>
                          setEntryEdit({
                            ...entryEdit,
                            amount: event.target.value,
                          })
                        }
                        aria-label="금액"
                      />
                      <input
                        type="date"
                        value={entryEdit.date}
                        onChange={(event) =>
                          setEntryEdit({ ...entryEdit, date: event.target.value })
                        }
                        aria-label="날짜"
                      />
                      <select
                        value={entryEdit.kind}
                        onChange={(event) =>
                          setEntryEdit({ ...entryEdit, kind: event.target.value })
                        }
                        aria-label="종류"
                      >
                        {["income", "expense", "refund", "repayment", "transfer"].map(
                          (kind) => (
                            <option key={kind} value={kind}>
                              {labels[kind]}
                            </option>
                          ),
                        )}
                      </select>
                      <button type="submit" disabled={busy}>
                        저장
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setEntryEdit(null)}
                      >
                        취소
                      </button>
                    </form>
                  ) : (
                  <div className="due" key={e.id}>
                    <div>
                      <b>{e.title}</b>
                      <small>
                        {e.occurred_on} · {labels[e.kind]} ·{" "}
                        {labels[e.payment_method] || e.payment_method}
                      </small>
                    </div>
                    <strong>
                      {["income", "refund"].includes(e.kind)
                        ? "+"
                        : e.kind === "transfer"
                          ? ""
                          : "−"}
                      {won(e.amount)}
                    </strong>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        setEntryEdit({
                          id: e.id,
                          title: e.title,
                          kind: e.kind,
                          amount: String(e.amount),
                          date: e.occurred_on,
                          method: e.payment_method,
                        })
                      }
                    >
                      고치기
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm("이 기록을 취소할까요? 원본 메모는 남습니다.")
                        )
                          action(async () => {
                            await send({ action: "void", id: e.id });
                          });
                      }}
                    >
                      취소
                    </button>
                  </div>
                  ),
                )}
              {!rows.some((e) => !e.voided_at) && (
                <p>선택한 기간의 내역이 없어요.</p>
              )}
            </section>

            {dueCards}

            <ScheduleForm
              busy={busy}
              onSave={(body) =>
                action(async () => {
                  await send(body);
                })
              }
            />
            <section className="card">
              <h2>이어지는 일정</h2>
              {data.schedules.filter((schedule) => schedule.active).length ? (
                data.schedules
                  .filter((schedule) => schedule.active)
                  .map((schedule) =>
                    scheduleEdit?.id === schedule.id ? (
                      <form
                        className="due"
                        key={schedule.id}
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!scheduleEdit) return;
                          void action(async () => {
                            await send({
                              action: "schedule-revise",
                              schedule: {
                                id: schedule.id,
                                title: scheduleEdit.title,
                                kind: schedule.kind,
                                amount: Number(scheduleEdit.amount),
                                recurrence: schedule.recurrence,
                                day: schedule.day_of_month,
                                start: schedule.start_date,
                                end: schedule.end_date,
                              },
                            });
                            setScheduleEdit(null);
                          });
                        }}
                      >
                        <input
                          value={scheduleEdit.title}
                          maxLength={200}
                          onChange={(event) =>
                            setScheduleEdit({
                              ...scheduleEdit,
                              title: event.target.value,
                            })
                          }
                          aria-label="일정 이름"
                        />
                        <input
                          type="number"
                          min="1"
                          value={scheduleEdit.amount}
                          onChange={(event) =>
                            setScheduleEdit({
                              ...scheduleEdit,
                              amount: event.target.value,
                            })
                          }
                          aria-label="예정 금액"
                        />
                        <button type="submit" disabled={busy}>
                          저장
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setScheduleEdit(null)}
                        >
                          취소
                        </button>
                      </form>
                    ) : (
                    <div className="due" key={schedule.id}>
                      <div>
                        <b>{schedule.title}</b>
                        <small>
                          {won(schedule.amount)} ·{" "}
                          {schedule.recurrence === "monthly"
                            ? `매월 ${schedule.day_of_month}일`
                            : schedule.start_date}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          setScheduleEdit({
                            id: schedule.id,
                            title: schedule.title,
                            amount: String(schedule.amount),
                          })
                        }
                      >
                        고치기
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          if (!confirm("이 일정을 끝낼까요? 이미 적은 납부는 남아요."))
                            return;
                          void action(async () => {
                            await send({
                              action: "schedule-end",
                              id: schedule.id,
                            });
                          });
                        }}
                      >
                        끝내기
                      </button>
                    </div>
                    ),
                  )
              ) : (
                <p className="hint">이어지는 일정이 없어요.</p>
              )}
            </section>

            <h2 className="section-heading">가계부와 연결된 메모</h2>
            {memoCards("money")}
          </>
        )}

        {/* 7. BREATHE TAB */}
        {page === "breathe" && (
          <>
            <section className="card grounding">
              <img src="/symbol.png" alt="" />
              <h2>지금 당장 결정하지 않아도 돼요.</h2>
              <p>
                숨을 편하게 쉬고, 사고 싶은 이유와 지금 느끼는 감정을 마음함에
                남겨보세요.
              </p>
              <button onClick={() => setBreathing(true)}>잠깐 숨고르기</button>
              <button
                className="secondary"
                onClick={() => {
                  setText(
                    "사고 싶은 것:\n가격:\n지금 느끼는 감정:\n하루 뒤에도 필요한 이유:",
                  );
                  setPage("inbox");
                }}
              >
                구매 전에 적어보기
              </button>
            </section>
            {memoCards("breathe")}
          </>
        )}
      </main>

      <button className="pause" onClick={() => setBreathing(true)}>
        Ⅱ 잠깐 숨고르기
      </button>

      {candidate && page !== "money" && (
        <div className="modal">
          <div className="dialog">
            <EntryForm
              candidate={candidate}
              busy={busy}
              onCancel={() => setCandidate(null)}
              onSave={(body) =>
                action(async () => {
                  await send(body);
                  setCandidate(null);
                })
              }
            />
          </div>
        </div>
      )}

      {breathing && <BreatheModal onClose={() => setBreathing(false)} />}
    </div>
  );
}
