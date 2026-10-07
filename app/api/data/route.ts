import { authenticatedClient as client } from "@/lib/server";
import { koreaDate, monthRange } from "@/lib/finance.mjs";
import { classifyMemo } from "@/lib/ai.mjs";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function response(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request) {
  try {
    const db = await client(req);
    const { searchParams } = new URL(req.url);
    
    // [개선] 데이터 누적 대비: cursor 및 month 쿼리 파라미터 지원
    const month = searchParams.get("month"); // 예: '2026-10'
    const memoCursor = searchParams.get("memo_cursor"); // 이전 마지막 created_at
    const entryCursor = searchParams.get("entry_cursor"); // 이전 마지막 occurred_on
    const limit = Math.min(Number(searchParams.get("limit")) || 30, 50);

    let memoQuery = db
      .from("memos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (memoCursor) {
      memoQuery = memoQuery.lt("created_at", memoCursor);
    }

    let entryQuery = db
      .from("entries")
      .select("*")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      const { start, end } = monthRange(month);
      entryQuery = entryQuery.gte("occurred_on", start).lte("occurred_on", end);
    } else if (entryCursor) {
      entryQuery = entryQuery.lt("occurred_on", entryCursor);
    }

    const [memos, entries, schedules, settlements] = await Promise.all([
      memoQuery,
      entryQuery,
      db.from("schedules").select("*").eq("active", true).order("created_at"),
      db.from("settlements").select("schedule_id,due_date"),
    ]);

    if (memos.error || entries.error || schedules.error || settlements.error) {
      throw Error("데이터를 불러오지 못했습니다. DB 연결을 확인해 주세요.");
    }

    return response({
      memos: memos.data,
      entries: entries.data,
      schedules: schedules.data,
      settlements: settlements.data,
      nextMemoCursor: memos.data?.at(-1)?.created_at || null,
      nextEntryCursor: entries.data?.at(-1)?.occurred_on || null,
      hasMore: (entries.data?.length || 0) === limit,
    });
  } catch (e) {
    return response(
      { error: e instanceof Error ? e.message : "조회 실패" },
      400
    );
  }
}

export async function POST(req: Request) {
  // 기존 POST 로직 (멱등성 UUID 및 save_memo RPC 보존)
  try {
    const length = Number(req.headers.get("content-length") || 0);
    if (length > 40000) return response({ error: "요청이 너무 큽니다." }, 413);
    const db = await client(req),
      raw = await req.text();
    if (new TextEncoder().encode(raw).length > 40000)
      return response({ error: "요청이 너무 큽니다." }, 413);
    const body = JSON.parse(raw);
    let result;
    let aiMode: string | undefined;
    let memoFragments: unknown;

    if (body.action === "memo") {
      if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 10000)
        throw Error("메모를 1~10000자로 입력해 주세요.");
      if (!/^[0-9a-f-]{36}$/i.test(body.requestId))
        throw Error("저장 요청 ID가 필요합니다.");

      const existing = await db
        .from("memos")
        .select("id,body,fragments")
        .eq("request_id", body.requestId)
        .maybeSingle();
      if (existing.error) throw Error("저장 상태를 확인하지 못했습니다.");
      if (existing.data) {
        return response({
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
    } else {
      throw Error("지원하지 않는 작업입니다.");
    }

    if (result.error) throw Error(result.error.message);
    return response({
      ok: true,
      result: result.data,
      aiMode,
      fragments: memoFragments,
    });
  } catch (e) {
    return response(
      { error: e instanceof Error ? e.message : "저장 실패" },
      400
    );
  }
}
