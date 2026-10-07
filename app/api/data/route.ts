import { authenticatedClient as client } from "@/lib/server";
import { koreaDate } from "@/lib/finance.mjs";
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
    const results = await Promise.all([
      db.from("memos").select("*").order("created_at", { ascending: false }),
      db.from("entries").select("*").order("occurred_on", { ascending: false }),
      db.from("schedules").select("*").order("created_at"),
      db.from("settlements").select("schedule_id,due_date"),
    ]);
    if (results.some((r) => r.error))
      throw Error(
        "데이터를 불러오지 못했습니다. Supabase SQL 설정을 확인해 주세요.",
      );
    return response(
      Object.fromEntries(
        ["memos", "entries", "schedules", "settlements"].map((k, i) => [
          k,
          results[i].data,
        ]),
      ),
    );
  } catch (e) {
    return response(
      { error: e instanceof Error ? e.message : "조회 실패" },
      400,
    );
  }
}
export async function POST(req: Request) {
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
      if (
        typeof body.text !== "string" ||
        !body.text.trim() ||
        body.text.length > 10000
      )
        throw Error("메모를 1~10000자로 입력해 주세요.");
      if (!/^[0-9a-f-]{36}$/i.test(body.requestId))
        throw Error("저장 요청 ID가 필요합니다.");
      // Avoid billing AI again after a successful save whose response was lost.
      const existing = await db
        .from("memos")
        .select("id,body,fragments")
        .eq("request_id", body.requestId)
        .maybeSingle();
      if (existing.error) throw Error("저장 상태를 확인하지 못했습니다.");
      if (existing.data) {
        if (existing.data.body !== body.text)
          throw Error("요청 ID가 다른 메모에 사용되었습니다.");
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
    } else if (body.action === "void")
      result = await db.rpc("void_entry", { p_id: body.id });
    else if (body.action === "schedule") {
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
    } else if (body.action === "settle")
      result = await db.rpc("settle_schedule", {
        p_schedule: body.id,
        p_due: body.due,
        p_date: koreaDate(),
        p_request: body.requestId,
      });
    else throw Error("지원하지 않는 작업입니다.");
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
      400,
    );
  }
}
