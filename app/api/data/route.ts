import {
  ApiError,
  authenticatedClient as client,
  errorResponse,
  jsonResponse,
} from "@/lib/server";
import { koreaDate, monthRange } from "@/lib/finance.mjs";
import { classifyMemo } from "@/lib/ai.mjs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
type Row = Record<string, unknown>;
async function pages<T extends Row>(
  load: (
    offset: number,
    last: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  cap: number,
) {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let offset = 0; offset < cap; offset += pageSize) {
    const { data, error } = await load(offset, offset + pageSize - 1);
    if (error) throw new ApiError(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}
function totalsOf(value: unknown) {
  const row =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const n = (key: string) => {
    const amount = Number(row[key] || 0);
    if (!Number.isSafeInteger(amount)) throw new ApiError("합계를 확인하지 못했습니다.");
    return amount;
  };
  return {
    income: n("income"),
    expense: n("expense"),
    refund: n("refund"),
    repayment: n("repayment"),
    net: n("net"),
    count: n("count"),
  };
}
export async function GET(req: Request) {
  try {
    const db = await client(req);
    const url = new URL(req.url);
    const current = monthRange(koreaDate().slice(0, 7));
    const from = url.searchParams.get("from") || current.start;
    const to = url.searchParams.get("to") || current.end;
    if (!DATE.test(from) || !DATE.test(to) || to < from)
      throw new ApiError("조회 기간을 확인해 주세요.");
    const [memos, pending, entries, schedules, settlements, totals, monthTotals] =
      await Promise.all([
        pages(
          (offset, last) =>
            db
              .from("memos")
              .select("*")
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
              .range(offset, last),
          5000,
        ),
        db
          .from("memos")
          .select("*")
          .filter("fragments", "cs", JSON.stringify([{ status: "pending" }]))
          .order("created_at", { ascending: false })
          .limit(200),
        pages(
          (offset, last) =>
            db
              .from("entries")
              .select("*")
              .gte("occurred_on", from)
              .lte("occurred_on", to)
              .order("occurred_on", { ascending: false })
              .order("id", { ascending: false })
              .range(offset, last),
          20000,
        ),
        pages(
          (offset, last) =>
            db
              .from("schedules")
              .select("*")
              .order("created_at")
              .range(offset, last),
          5000,
        ),
        pages(
          (offset, last) =>
            db
              .from("settlements")
              .select("schedule_id,due_date")
              .order("due_date", { ascending: false })
              .range(offset, last),
          20000,
        ),
        db.rpc("ledger_totals", { p_start: from, p_end: to }),
        from === current.start && to === current.end
          ? Promise.resolve(null)
          : db.rpc("ledger_totals", {
              p_start: current.start,
              p_end: current.end,
            }),
      ]);
    let cooling = { rows: [] as Row[], truncated: false };
    try {
      cooling = await pages(
        (offset, last) =>
          db
            .from("cooling_off_items")
            .select("*")
            .order("created_at", { ascending: false })
            .range(offset, last),
        2000,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (!/cooling_off_items|schema cache/i.test(message)) throw e;
    }
    if (pending.error) throw new ApiError(pending.error.message);
    if (totals.error || monthTotals?.error)
      throw new ApiError("합계 SQL 마이그레이션(006)을 먼저 적용해 주세요.");
    const seen = new Set(memos.rows.map((row) => row.id));
    for (const row of pending.data || []) if (!seen.has(row.id)) memos.rows.push(row);
    const rangeTotals = totalsOf(totals.data);
    return jsonResponse({
      memos: memos.rows,
      entries: entries.rows,
      schedules: schedules.rows,
      settlements: settlements.rows,
      cooling: cooling.rows,
      totals: rangeTotals,
      monthTotals: monthTotals ? totalsOf(monthTotals.data) : rangeTotals,
      entriesTruncated: entries.truncated,
      memosTruncated: memos.truncated,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const length = Number(req.headers.get("content-length") || 0);
    if (length > 40000) return jsonResponse({ error: "요청이 너무 큽니다." }, 413);
    const db = await client(req),
      raw = await req.text();
    if (new TextEncoder().encode(raw).length > 40000)
      return jsonResponse({ error: "요청이 너무 큽니다." }, 413);
    const body = JSON.parse(raw);
    let result;
    let aiMode: string | undefined;
    let memoFragments: unknown;
    if (body.action === "memo") {
      if (
        typeof body.text !== "string" ||
        !body.text.trim() ||
        body.text.length > 10000
      )
        throw new ApiError("메모를 1~10000자로 입력해 주세요.");
      if (!UUID.test(body.requestId))
        throw new ApiError("저장 요청 ID가 필요합니다.");
      const existing = await db
        .from("memos")
        .select("id,body,fragments")
        .eq("request_id", body.requestId)
        .maybeSingle();
      if (existing.error) throw new ApiError("저장 상태를 확인하지 못했습니다.");
      if (existing.data) {
        if (existing.data.body !== body.text)
          throw new ApiError("요청 ID가 다른 메모에 사용되었습니다.");
        return jsonResponse({
          ok: true,
          result: existing.data.id,
          aiMode: "reused",
          fragments: existing.data.fragments,
        });
      }
      const classification = await classifyMemo(body.text, koreaDate());
      const fragments = classification.fragments;
      memoFragments = fragments;
      aiMode = classification.aiMode;
      result = await db.rpc("save_memo", {
        p_request_id: body.requestId,
        p_body: body.text,
        p_fragments: fragments,
      });
    } else if (body.action === "entry") {
      result = await db.rpc("save_entry", {
        p_request_id: body.requestId,
        p_title: body.title,
        p_kind: body.kind,
        p_amount: body.amount,
        p_date: body.date,
        p_method: body.method || "cash",
        p_memo_id: body.memoId || null,
        p_fragment: body.fragment || null,
      });
    } else if (body.action === "void") {
      result = await db.rpc("void_entry", { p_id: body.id });
    } else if (body.action === "schedule") {
      const s = body.schedule;
      result = await db.rpc("save_schedule", {
        p_request: body.requestId,
        p_title: s.title,
        p_kind: s.kind,
        p_amount: s.amount,
        p_recurrence: s.recurrence,
        p_day: s.recurrence === "monthly" ? s.day : null,
        p_start: s.start,
        p_end: s.end || null,
      });
    } else if (body.action === "settle") {
      result = await db.rpc("settle_schedule", {
        p_schedule: body.id,
        p_due: body.due,
        p_date: koreaDate(),
        p_request: body.requestId,
      });
    } else if (body.action === "cooling") {
      const item = body.item || {};
      const title = String(item.title || "").trim();
      const amount = Number(item.amount);
      const status = String(item.status || "cooling");
      const hours = Number(item.coolDownHours || 24);
      if (!UUID.test(item.id)) throw new ApiError("보류 항목을 확인해 주세요.");
      if (title.length < 1 || title.length > 200)
        throw new ApiError("물건 이름을 1~200자로 입력해 주세요.");
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1e12)
        throw new ApiError("금액은 양의 정수여야 합니다.");
      if (!["cooling", "saved", "purchased"].includes(status))
        throw new ApiError("보류 상태를 확인해 주세요.");
      if (!Number.isInteger(hours) || hours < 1 || hours > 168)
        throw new ApiError("대기 시간을 확인해 주세요.");
      const expires = Date.parse(item.expiresAt)
        ? new Date(item.expiresAt).toISOString()
        : new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      result = await db.from("cooling_off_items").upsert(
        {
          id: item.id,
          title,
          amount,
          reason: String(item.reason || "").slice(0, 1000),
          emotion: String(item.emotion || "스트레스").slice(0, 40),
          cool_down_hours: hours,
          expires_at: expires,
          status,
        },
        { onConflict: "id" },
      );
    } else throw new ApiError("지원하지 않는 작업입니다.");
    if (result.error) throw new ApiError(result.error.message);
    return jsonResponse({
      ok: true,
      result: result.data,
      aiMode,
      fragments: memoFragments,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
