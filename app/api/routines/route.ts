import {
  authenticatedClient,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from "@/lib/server";
import { isoWeekday } from "@/lib/routines.mjs";
export const dynamic = "force-dynamic";
export function OPTIONS() {
  return optionsResponse();
}
export async function GET(req: Request) {
  try {
    const db = await authenticatedClient(req);
    const date = new URL(req.url).searchParams.get("date");
    if (date) isoWeekday(date);
    let logQuery = db
      .from("routine_logs")
      .select("*")
      .order("due_on", { ascending: false })
      .limit(1000);
    if (date) logQuery = logQuery.eq("due_on", date);
    const results = await Promise.all([
      db.from("routines").select("*").order("local_time"),
      logQuery,
    ]);
    if (results.some((r) => r.error))
      throw Error("루틴 SQL 마이그레이션을 먼저 적용해 주세요.");
    return jsonResponse({ routines: results[0].data, logs: results[1].data });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const db = await authenticatedClient(req);
    const raw = await req.text();
    if (raw.length > 15000)
      return jsonResponse({ error: "요청이 너무 큽니다." }, 413);
    const b = JSON.parse(raw);
    let result;
    if (b.action === "save") {
      const r = b.routine;
      result = await db.rpc("save_routine", {
        p_id: r.id,
        p_title: r.title,
        p_time: r.time,
        p_days: r.days,
        p_start: r.start,
        p_end: r.end || null,
        p_reminder: r.reminder,
        p_active: r.active ?? true,
      });
    } else if (b.action === "status")
      result = await db.rpc("set_routine_status", {
        p_request: b.requestId,
        p_routine: b.id,
        p_due: b.date,
        p_status: b.status,
        p_completed_at: b.completedAt || null,
        p_expected: b.expected ?? null,
        p_snoozed_until: b.localSnooze || null,
      });
    else throw Error("지원하지 않는 작업입니다.");
    if (result.error) throw Error(result.error.message);
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
