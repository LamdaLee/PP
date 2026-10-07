"use client";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { RoutineManager, RoutineToday, useRoutines } from "./Routines";
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
    [text, setText] = useState(""),
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
  async function reload() {
    const sequence = ++reloadCount.current;
    const db = browserClient();
    const {
      data: { session: s },
    } = await db.auth.getSession();
    if (!s) return;
    const user = s.user.id;
    const r = await fetch("/api/data", {
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
        setReady(true);
      }
    });
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [configured]);
  useEffect(() => {
    currentUser.current = session?.user.id || null;
    setData(blank);
    if (!session || !configured) return;
    let alive = true;
    const update = () =>
      reload().catch((e) => {
        if (alive) setError(e.message);
      });
    update();
    const db = browserClient();
    let channel = db.channel(`account-${session.user.id}`);
    for (const table of ["memos", "entries", "schedules", "settlements"])
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${session.user.id}`,
        },
        update,
      );
    channel.subscribe((status) => {
      if (!alive) return;
      setSync(status === "SUBSCRIBED" ? "실시간 연결" : "연결 확인 중");
      if (status === "SUBSCRIBED") {
        setSync("실시간 연결");
        update();
      }
    });
    const online = () => {
      setSync("다시 연결 중");
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
      alive = false;
      db.removeChannel(channel);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [session?.user.id, configured]);
  async function send(body: unknown) {
    if (!navigator.onLine)
      throw Error(
        "연결이 끊겨 있습니다. 입력을 보관하고 연결 후 다시 저장해 주세요.",
      );
    const {
      data: { session: s },
    } = await browserClient().auth.getSession();
    if (!s) throw Error("로그인이 필요합니다.");
    const r = await fetch("/api/data", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${s.access_token}`,
        "Content-Type": "application/json",
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
      setNotice(message || "저장했어요. 다른 기기에도 연결됩니다.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업을 완료하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function saveMemo() {
    if (!text.trim()) return;
    await action(async () => {
      if (memoRequest.current.text !== text)
        memoRequest.current = { text, id: crypto.randomUUID() };
      const result = await send({
        action: "memo",
        text,
        requestId: memoRequest.current.id,
      });
      setText("");
      memoRequest.current = { text: "", id: "" };
      return result.aiMode === "applied"
        ? "AI로 정리하고 저장했어요. 금액 후보는 확인해 주세요."
        : result.aiMode === "fallback"
          ? "AI 연결을 확인하지 못해 기본 분류로 저장했어요."
          : "기본 분류로 저장했어요. 다른 기기에도 연결됩니다.";
    });
  }
  const rows = data.entries.filter(
      (e) => e.occurred_on >= range.start && e.occurred_on <= range.end,
    ),
    totals = sumLedger(rows),
    today = koreaDate();
  const due = data.schedules
    .flatMap((s) =>
      scheduleOccurrences(
        s,
        today,
        data.settlements.filter((t) => t.schedule_id === s.id),
      ),
    )
    .sort((a: { due_date: string }, b: { due_date: string }) =>
      a.due_date.localeCompare(b.due_date),
    );
  const nav = [
    ["inbox", "생각함"],
    ["money", "돈"],
    ["routine", "루틴"],
    ["work", "일"],
    ["emotion", "기록"],
    ["breathe", "숨고르기"],
  ];
  if (!ready)
    return (
      <main className="auth">
        <p>잠시 준비하고 있어요.</p>
      </main>
    );
  if (!configured)
    return (
      <main className="auth">
        <Brand />
        <h1>잠깐 멈추고, 생각을 모아요.</h1>
        <p>
          개발 프로젝트가 준비됐습니다. Supabase SQL을 실행하고 .env.example의
          두 환경변수를 설정하면 로그인과 기기 간 동기화를 사용할 수 있습니다.
        </p>
        <p>설정 순서는 함께 제공한 README.md에 있습니다.</p>
      </main>
    );
  if (!session)
    return (
      <main className="auth">
        <Brand />
        <h1>생각이 머무는 자리</h1>
        <p>같은 계정으로 로그인하면 기기가 바뀌어도 기록을 이어갈 수 있어요.</p>
        <Auth />
      </main>
    );
  function memoCards(category?: string) {
    const list = data.memos.filter(
      (m) =>
        !category || m.fragments.some((f) => f.categories.includes(category)),
    );
    return list.length ? (
      list.map((m) => (
        <article className="card memo" key={m.id}>
          <time>
            {new Intl.DateTimeFormat("ko-KR", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Seoul",
            }).format(new Date(m.created_at))}
          </time>
          <p className="original">{m.body}</p>
          <div className="fragments">
            {m.fragments.map((f) => (
              <div key={f.id}>
                <span className="tags">
                  {f.categories.map((c) => labels[c] || c).join(" · ")}
                </span>{" "}
                {f.status === "posted" && (
                  <span className="status">가계부 반영</span>
                )}
                {f.status === "voided" && (
                  <span className="status">가계부 취소</span>
                )}
                <p>{f.text}</p>
                {f.status === "pending" && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setCandidate({ memo: m, fragment: f })}
                  >
                    금액·날짜 확인 후 기록
                  </button>
                )}
              </div>
            ))}
          </div>
        </article>
      ))
    ) : (
      <div className="card empty">
        아직 기록이 없어요. 생각함에 한 줄부터 적어보세요.
      </div>
    );
  }
  const dueCards = (
    <div className="card">
      <div className="section-title">
        <h2>다가오는 돈의 일정</h2>
        <button className="text-button" onClick={() => setPage("money")}>
          설정하기
        </button>
      </div>
      <p className="hint">
        예정 금액은 가계부에 합산하지 않아요. 실제 입금·납부했을 때 기록하세요.
      </p>
      {due.slice(0, page === "money" ? 100 : 3).map((s: any) => (
        <div className="due" key={s.id + s.due_date}>
          <div>
            <b>{s.title}</b>
            <small>
              {s.due_date} {s.overdue ? "· 확인이 필요해요" : ""}
            </small>
          </div>
          <span>{won(s.amount)}</span>
          <button
            disabled={busy}
            className="secondary"
            onClick={() => {
              if (
                confirm(
                  `${s.title} ${won(s.amount)}을 실제로 입금·납부했나요? 오늘 날짜로 기록합니다.`,
                )
              )
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
              onClick={() => setPage(id)}
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
        {page === "inbox" && (
          <>
            <section className="card capture">
              <h2>지금 떠오르는 것을 놓아두세요.</h2>
              <p>정리하지 않아도 괜찮아요. 돈, 감정, 일로 연결해 둘게요.</p>
              <label className="sr-only" htmlFor="dump">
                생각 메모
              </label>
              <textarea
                id="dump"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  "21000원 우산 구매\n오늘은 조금 불안해. 보고서 작성해야 해."
                }
                maxLength={10000}
              />
              <div className="capture-footer">
                <small>명확한 구매는 바로 기록 · 애매한 내용은 확인 대기</small>
                <button disabled={busy || !text.trim()} onClick={saveMemo}>
                  {busy ? "저장 중…" : "생각 내려놓기"}
                </button>
              </div>
            </section>
            <div className="grid">
              <div className="card butter">
                <p className="eyebrow">이번 달 소비</p>
                <h2>
                  {won(
                    sumLedger(
                      data.entries.filter(
                        (e) => e.occurred_on.slice(0, 7) === today.slice(0, 7),
                      ),
                    ).expense,
                  )}
                </h2>
                <p>대금·상환과 예정 금액은 따로 표시해요.</p>
                <button
                  className="text-button"
                  onClick={() => setPage("money")}
                >
                  돈 살펴보기 →
                </button>
              </div>
              {dueCards}
            </div>
            <RoutineToday controller={routineController} compact />
            <button className="text-button" onClick={() => setPage("routine")}>
              루틴 등록·관리 →
            </button>
            <h2 className="section-heading">내려놓은 생각들</h2>
            {memoCards()}
          </>
        )}
        {page === "routine" && (
          <RoutineManager controller={routineController} />
        )}
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
                기록합니다.
              </p>
            </section>
            <EntryForm
              key={
                candidate ? candidate.memo.id + candidate.fragment.id : "manual"
              }
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
                .map((e) => (
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
                ))}
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
            <h2 className="section-heading">돈과 연결된 메모</h2>
            {memoCards("money")}
          </>
        )}
        {page === "work" && (
          <>
            <section className="card butter">
              <h2>지금은 한 가지씩</h2>
              <p>
                업무 메모를 한곳에서 살펴보세요. 실행 순서·체크리스트 기능은
                다음 개발 단계에 연결할 수 있어요.
              </p>
            </section>
            {memoCards("work")}
          </>
        )}
        {page === "emotion" && (
          <>
            <section className="card apricot">
              <h2>오늘 마음은 어땠나요?</h2>
              <p>
                생각함에 감정과 사건을 적으면 날짜별 원본 기록과 함께 이곳에서
                볼 수 있어요.
              </p>
              <button onClick={() => setPage("inbox")}>
                마음 기록하러 가기
              </button>
            </section>
            {memoCards("emotion")}
          </>
        )}
        {page === "breathe" && (
          <>
            <section className="card grounding">
              <img src="/symbol.png" alt="" />
              <h2>지금 당장 결정하지 않아도 돼요.</h2>
              <p>
                숨을 편하게 쉬고, 사고 싶은 이유와 지금 느끼는 감정을 생각함에
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
      {breathing && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="숨고르기"
        >
          <div className="dialog grounding">
            <div className="breath-orb" />
            <h2>편하게 숨을 쉬어요.</h2>
            <p>
              지금 무엇을 느끼고 있나요?
              <br />
              결정은 잠시 뒤로 미뤄도 괜찮아요.
            </p>
            <button autoFocus onClick={() => setBreathing(false)}>
              조금 차분해졌어요
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <img src="/symbol.png" alt="" />
      <b>Pause&amp;Ponder</b>
    </div>
  );
}
function Auth() {
  const [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget),
          credentials = {
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
function EntryForm({
  candidate,
  busy,
  onSave,
  onCancel,
}: {
  candidate: { memo: Memo; fragment: Fragment } | null;
  busy: boolean;
  onSave: (b: unknown) => Promise<boolean>;
  onCancel: () => void;
}) {
  const id = useRef(crypto.randomUUID());
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form);
        const ok = await onSave({
          action: "entry",
          requestId: id.current,
          title: f.get("title"),
          kind: f.get("kind"),
          amount: Number(f.get("amount")),
          date: f.get("date"),
          method: f.get("method"),
          memoId: candidate?.memo.id,
          fragment: candidate?.fragment.id,
        });
        if (ok) {
          id.current = crypto.randomUUID();
          form.reset();
        }
      }}
    >
      <h2>{candidate ? "메모를 확인하고 기록" : "직접 기록하기"}</h2>
      <label>
        내용
        <input
          name="title"
          defaultValue={candidate?.fragment.text || ""}
          maxLength={500}
          required
        />
      </label>
      <div className="form-row">
        <label>
          종류
          <select
            name="kind"
            defaultValue={candidate?.fragment.kind || "expense"}
          >
            {["expense", "income", "refund", "repayment", "transfer"].map(
              (k) => (
                <option value={k} key={k}>
                  {labels[k]}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          금액(원)
          <input
            name="amount"
            type="number"
            min="1"
            max="1000000000000"
            step="1"
            defaultValue={candidate?.fragment.amount || ""}
            required
          />
        </label>
        <label>
          발생일
          <input name="date" type="date" defaultValue={koreaDate()} required />
        </label>
        <label>
          결제 수단
          <select name="method">
            <option value="cash">현금</option>
            <option value="debit">체크카드</option>
            <option value="credit">신용카드</option>
            <option value="account">계좌</option>
          </select>
        </label>
      </div>
      <button disabled={busy}>가계부에 기록</button>
      {candidate && (
        <button type="button" className="text-button" onClick={onCancel}>
          나중에 확인
        </button>
      )}
    </form>
  );
}
function ScheduleForm({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (b: unknown) => Promise<boolean>;
}) {
  const id = useRef(crypto.randomUUID());
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form);
        const ok = await onSave({
          action: "schedule",
          requestId: id.current,
          schedule: {
            title: f.get("title"),
            kind: f.get("kind"),
            amount: Number(f.get("amount")),
            recurrence: f.get("recurrence"),
            day: Number(f.get("day")),
            start: f.get("start"),
            end: f.get("end"),
          },
        });
        if (ok) {
          id.current = crypto.randomUUID();
          form.reset();
        }
      }}
    >
      <h2>정기 입금·납부 설정</h2>
      <label>
        이름
        <input
          name="title"
          placeholder="월급, 대출 상환, 카드 결제일"
          required
          maxLength={200}
        />
      </label>
      <div className="form-row">
        <label>
          종류
          <select name="kind">
            <option value="salary">월급</option>
            <option value="loan">대출</option>
            <option value="credit">카드값</option>
            <option value="rent">월세</option>
            <option value="other">기타</option>
          </select>
        </label>
        <label>
          예정 금액
          <input
            name="amount"
            type="number"
            min="1"
            step="1"
            max="1000000000000"
            required
          />
        </label>
        <label>
          반복
          <select name="recurrence">
            <option value="monthly">매월</option>
            <option value="once">한 번</option>
          </select>
        </label>
        <label>
          매월 날짜
          <input
            name="day"
            type="number"
            min="1"
            max="31"
            defaultValue={25}
            required
          />
        </label>
        <label>
          시작·일회 날짜
          <input name="start" type="date" defaultValue={koreaDate()} required />
        </label>
        <label>
          종료(선택)
          <input name="end" type="date" />
        </label>
      </div>
      <p className="hint">
        말일보다 큰 날짜는 그달의 마지막 날에 표시됩니다. 카드값은 명세서에 맞춰
        금액을 설정하세요.
      </p>
      <button disabled={busy}>일정 추가</button>
    </form>
  );
}
