"use client";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { koreaDate } from "@/lib/finance.mjs";
import { routineOccurrences, dueReminders } from "@/lib/routines.mjs";
export type Routine = {
  id: string;
  title: string;
  local_time: string;
  weekdays: number[];
  start_date: string;
  end_date: string | null;
  reminder_enabled: boolean;
  active: boolean;
  updated_at: string;
};
export type RoutineLog = {
  routine_id: string;
  due_on: string;
  status: string;
  completed_at: string | null;
  snoozed_until: string | null;
  updated_at: string;
};
export function useRoutines(userId: string | null) {
  const [routines, setRoutines] = useState<Routine[]>([]),
    [logs, setLogs] = useState<RoutineLog[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(() => new Date()),
    [notice, setNotice] = useState("");
  const sent = useRef(new Set<string>()),
    sequence = useRef(0),
    userRef = useRef(userId);
  userRef.current = userId;
  const today = koreaDate(now),
    items = routineOccurrences(routines, logs, today);
  async function refresh() {
    if (!userId) return;
    const seq = ++sequence.current;
    const {
      data: { session },
    } = await browserClient().auth.getSession();
    if (!session || session.user.id !== userId) return;
    const r = await fetch("/api/routines", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const body = await r.json();
    if (!r.ok) throw Error(body.error);
    if (seq === sequence.current && userRef.current === userId) {
      setRoutines(body.routines);
      setLogs(body.logs);
      setError("");
    }
  }
  useEffect(() => {
    setRoutines([]);
    setLogs([]);
    sent.current.clear();
    if (!userId) return;
    let active = true;
    const reload = () =>
      refresh().catch((e) => {
        if (active) setError(e.message);
      });
    reload();
    let ch = browserClient().channel(`routines-${userId}`);
    for (const table of ["routines", "routine_logs"])
      ch = ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
        reload,
      );
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") reload();
    });
    const timer = setInterval(() => setNow(new Date()), 30000);
    const visible = () => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener("online", reload);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      sequence.current++;
      clearInterval(timer);
      browserClient().removeChannel(ch);
      window.removeEventListener("online", reload);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId]);
  useEffect(() => {
    if (
      !userId ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    )
      return;
    for (const item of dueReminders(items, now)) {
      const key = `${userId}:${item.id}:${item.due_on}:${item.remind_at}`;
      if (sent.current.has(key)) continue;
      try {
        if (sessionStorage.getItem(key)) continue;
        new Notification("Pause&Ponder · 루틴 시간이에요", {
          body: item.title,
          tag: key,
        });
        sent.current.add(key);
        sessionStorage.setItem(key, "1");
      } catch {
        /* Mobile browsers may require service worker notifications. Native app handles closed-app reminders. */
      }
    }
  }, [items, now, userId]);
  async function post(body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!navigator.onLine)
        throw Error("웹 루틴 기록은 연결 후 다시 저장해 주세요.");
      const {
        data: { session },
      } = await browserClient().auth.getSession();
      if (!session) throw Error("로그인이 필요합니다.");
      const r = await fetch("/api/routines", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      await refresh();
      setNotice("루틴을 기록했어요.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function mark(id: string, status: string, date = today) {
    return post({
      action: "status",
      id,
      date,
      status,
      requestId: crypto.randomUUID(),
      completedAt: status === "completed" ? new Date().toISOString() : null,
      localSnooze:
        status === "snoozed"
          ? new Date(Date.now() + 600000).toISOString()
          : null,
      expected:
        logs.find((l) => l.routine_id === id && l.due_on === date)
          ?.updated_at || "absent",
    });
  }
  async function history(date: string): Promise<RoutineLog[]> {
    const {
      data: { session },
    } = await browserClient().auth.getSession();
    if (!session || session.user.id !== userId)
      throw Error("로그인이 필요합니다.");
    const response = await fetch(
      `/api/routines?date=${encodeURIComponent(date)}`,
      {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      },
    );
    const body = await response.json();
    if (!response.ok) throw Error(body.error);
    return body.logs;
  }
  async function notify() {
    if (typeof Notification === "undefined") {
      setError(
        "이 브라우저는 화면 알림을 지원하지 않습니다. Android 앱의 예약 알림을 사용해 주세요.",
      );
      return;
    }
    let permission: NotificationPermission;
    try {
      permission = await Notification.requestPermission();
      if (permission === "granted") {
        const probe = new Notification("Pause&Ponder", {
          body: "화면 알림을 켰어요.",
        });
        probe.close();
      }
    } catch {
      setError(
        "이 브라우저의 화면 알림은 지원되지 않습니다. Android 앱의 예약 알림을 사용해 주세요.",
      );
      return;
    }
    setNotice(
      permission === "granted"
        ? "화면을 열어둔 동안 알림을 받을 수 있어요."
        : "브라우저 설정에서 알림 권한을 확인해 주세요.",
    );
    setNow(new Date());
  }
  return {
    routines,
    logs,
    items,
    today,
    error,
    busy,
    notice,
    post,
    mark,
    notify,
    history,
  };
}
export type RoutineController = ReturnType<typeof useRoutines>;
export function RoutineToday({
  controller: c,
  compact = false,
}: {
  controller: RoutineController;
  compact?: boolean;
}) {
  return (
    <section className="card">
      <div className="section-title">
        <h2>오늘의 루틴</h2>
        <small>{c.today} · 한국 시간</small>
      </div>
      {c.error && (
        <p className="hint" role="alert">
          {c.error}
        </p>
      )}
      {c.notice && (
        <p role="status" className="notice">
          {c.notice}
        </p>
      )}
      {c.items.slice(0, compact ? 3 : 100).map((r: any) => (
        <div className="routine-row" key={r.id}>
          <div>
            <b>{r.title}</b>
            <small>
              {r.local_time.slice(0, 5)} ·{" "}
              {r.status === "completed"
                ? "완료"
                : r.status === "skipped"
                  ? "건너뜀"
                  : r.status === "snoozed"
                    ? "10분 뒤에 알림"
                    : "아직 확인하지 않았어요"}
            </small>
            {r.completed_at && (
              <small>
                기록 시간{" "}
                {new Date(r.completed_at).toLocaleTimeString("ko-KR", {
                  timeZone: "Asia/Seoul",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
            )}
          </div>
          <div className="routine-actions">
            {["completed", "skipped"].includes(r.status) ? (
              <button
                className="text-button"
                disabled={c.busy}
                onClick={() => c.mark(r.id, "pending")}
              >
                되돌리기
              </button>
            ) : (
              <>
                <button
                  disabled={c.busy}
                  onClick={() => c.mark(r.id, "completed")}
                >
                  완료
                </button>
                {r.reminder_enabled && (
                  <button
                    className="secondary"
                    disabled={c.busy}
                    onClick={() => c.mark(r.id, "snoozed")}
                  >
                    10분 뒤
                  </button>
                )}
                <button
                  className="text-button"
                  disabled={c.busy}
                  onClick={() => c.mark(r.id, "skipped")}
                >
                  건너뛰기
                </button>
              </>
            )}
          </div>
        </div>
      ))}
      {!c.items.length && <p className="hint">오늘 예정된 루틴이 없어요.</p>}
    </section>
  );
}
export function RoutineManager({
  controller: c,
}: {
  controller: RoutineController;
}) {
  const [edit, setEdit] = useState<Routine | null>(null),
    [historyDate, setHistoryDate] = useState(c.today);
  const [historyLogs, setHistoryLogs] = useState<RoutineLog[]>([]),
    [historyError, setHistoryError] = useState(""),
    [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setHistoryLogs([]);
    setHistoryError("");
    if (!historyDate) return;
    setHistoryLoading(true);
    c.history(historyDate)
      .then((rows) => {
        if (active) setHistoryLogs(rows);
      })
      .catch((e) => {
        if (active) setHistoryError(e.message);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [historyDate, c.logs]);
  const formId = useRef(crypto.randomUUID());
  return (
    <>
      <RoutineToday controller={c} />
      <section className="card">
        <h2>알림 받기</h2>
        <p className="hint">
          웹 알림은 이 화면이 열려 있을 때만 동작합니다. 앱을 닫아도 받는 예약
          알림은 Android 동반 앱에서 설정하세요. 알림을 받았다는 사실만으로
          루틴이 완료되지는 않아요.
        </p>
        <button className="secondary" onClick={c.notify}>
          웹 화면 알림 허용
        </button>
      </section>
      <form
        key={edit?.id || "new"}
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          const ok = await c.post({
            action: "save",
            routine: {
              id: edit?.id || formId.current,
              title: f.get("title"),
              time: f.get("time"),
              days: f.getAll("days").map(Number),
              start: f.get("start"),
              end: f.get("end"),
              reminder: f.get("reminder") === "on",
              active: edit?.active ?? true,
            },
          });
          if (ok) {
            formId.current = crypto.randomUUID();
            form.reset();
            setEdit(null);
          }
        }}
      >
        <h2>{edit ? "루틴 수정" : "루틴 등록"}</h2>
        <label>
          이름
          <input
            name="title"
            required
            maxLength={120}
            placeholder="아침 약 챙기기, 물 마시기, 잠들기 준비"
            defaultValue={edit?.title || ""}
          />
        </label>
        <div className="form-row">
          <label>
            시간(한국 시간)
            <input
              name="time"
              type="time"
              defaultValue={edit?.local_time.slice(0, 5) || "09:00"}
              required
            />
          </label>
          <label>
            시작일
            <input
              name="start"
              type="date"
              defaultValue={edit?.start_date || c.today}
              required
            />
          </label>
          <label>
            종료일(선택)
            <input name="end" type="date" defaultValue={edit?.end_date || ""} />
          </label>
        </div>
        <fieldset>
          <legend>반복 요일</legend>
          <div className="weekday-list">
            {["월", "화", "수", "목", "금", "토", "일"].map((day, i) => (
              <label key={day}>
                <input
                  type="checkbox"
                  name="days"
                  value={i + 1}
                  defaultChecked={edit ? edit.weekdays.includes(i + 1) : true}
                />
                {day}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="check-label">
          <input
            name="reminder"
            type="checkbox"
            defaultChecked={edit?.reminder_enabled ?? true}
          />
          알림 켜기
        </label>
        <button disabled={c.busy}>{edit ? "변경 저장" : "루틴 추가"}</button>
        {edit && (
          <button
            className="text-button"
            type="button"
            onClick={() => setEdit(null)}
          >
            수정 취소
          </button>
        )}
      </form>
      <section className="card">
        <h2>등록한 루틴</h2>
        {c.routines.map((r) => (
          <div className="routine-row" key={r.id}>
            <div>
              <b>{r.title}</b>
              <small>
                {r.local_time.slice(0, 5)} ·{" "}
                {r.weekdays
                  .map((d) => ["월", "화", "수", "목", "금", "토", "일"][d - 1])
                  .join(" ")}{" "}
                · {r.active ? "사용 중" : "일시 중단"} ·{" "}
                {r.reminder_enabled ? "알림 켜짐" : "알림 꺼짐"}
              </small>
            </div>
            <button className="secondary" onClick={() => setEdit(r)}>
              수정
            </button>
            <button
              className="text-button"
              disabled={c.busy}
              onClick={() =>
                c.post({
                  action: "save",
                  routine: {
                    id: r.id,
                    title: r.title,
                    time: r.local_time,
                    days: r.weekdays,
                    start: r.start_date,
                    end: r.end_date,
                    reminder: r.reminder_enabled,
                    active: !r.active,
                  },
                })
              }
            >
              {r.active ? "중단" : "다시 사용"}
            </button>
          </div>
        ))}
      </section>
      <section className="card">
        <h2>날짜별 루틴 기록</h2>
        <label>
          날짜
          <input
            type="date"
            value={historyDate}
            max={c.today}
            onChange={(e) => setHistoryDate(e.target.value)}
          />
        </label>
        {historyLogs
          .filter((l) => l.due_on === historyDate)
          .map((l) => (
            <div className="due" key={l.routine_id + l.due_on}>
              <span>
                {c.routines.find((r) => r.id === l.routine_id)?.title || "루틴"}
              </span>
              <span>
                {
                  (
                    {
                      completed: "완료",
                      skipped: "건너뜀",
                      snoozed: "미룸",
                      pending: "미확인",
                    } as Record<string, string>
                  )[l.status]
                }
              </span>
            </div>
          ))}
        {historyLoading && <p role="status">기록을 불러오는 중…</p>}
        {historyError && <p role="alert">{historyError}</p>}
        {!historyLoading &&
          !historyError &&
          historyDate &&
          !historyLogs.some((l) => l.due_on === historyDate) && (
            <p className="hint">이 날짜에 남긴 기록이 없어요.</p>
          )}
      </section>
    </>
  );
}
