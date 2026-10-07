import { koreaDate } from "./finance.mjs";
export function isoWeekday(date) {
  const d = new Date(date + "T12:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date)
    throw Error("날짜를 확인해 주세요.");
  return d.getUTCDay() || 7;
}
export function routineOccurrences(routines, logs, date = koreaDate()) {
  const day = isoWeekday(date);
  return routines
    .filter(
      (r) =>
        r.active &&
        date >= r.start_date &&
        (!r.end_date || date <= r.end_date) &&
        r.weekdays.includes(day),
    )
    .map((r) => {
      const log = logs.find((l) => l.routine_id === r.id && l.due_on === date);
      return {
        ...r,
        due_on: date,
        status: log?.status || "pending",
        completed_at: log?.completed_at || null,
        snoozed_until: log?.snoozed_until || null,
        remind_at:
          log?.status === "snoozed"
            ? log.snoozed_until
            : `${date}T${r.local_time.slice(0, 5)}:00+09:00`,
      };
    })
    .sort((a, b) => a.local_time.localeCompare(b.local_time));
}
export function dueReminders(occurrences, now = new Date()) {
  // Web notifications only while this page is running; do not replay days-old reminders.
  return occurrences.filter(
    (r) =>
      r.reminder_enabled &&
      !["completed", "skipped"].includes(r.status) &&
      Date.parse(r.remind_at) <= now.getTime() &&
      now.getTime() - Date.parse(r.remind_at) < 15 * 60 * 1000,
  );
}
