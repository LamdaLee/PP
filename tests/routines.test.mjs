import { test } from "node:test";
import assert from "node:assert/strict";
import {
  routineOccurrences,
  dueReminders,
  isoWeekday,
} from "../lib/routines.mjs";
const r = {
  id: "r",
  title: "아침 루틴",
  active: true,
  reminder_enabled: true,
  local_time: "09:00:00",
  weekdays: [1, 3, 5],
  start_date: "2026-10-01",
  end_date: "2026-10-31",
};
test("루틴 날짜·요일·기간과 일시 중단", () => {
  assert.equal(isoWeekday("2026-10-07"), 3);
  assert.equal(routineOccurrences([r], [], "2026-10-07").length, 1);
  assert.equal(routineOccurrences([r], [], "2026-10-08").length, 0);
  assert.equal(
    routineOccurrences([{ ...r, active: false }], [], "2026-10-07").length,
    0,
  );
  assert.equal(routineOccurrences([r], [], "2026-11-02").length, 0);
  assert.throws(() => isoWeekday("2026-02-30"));
});
test("완료·건너뜀 제외, 미룸 새 시각과 오래된 알림 제외", () => {
  const at = new Date("2026-10-07T00:05:00Z");
  const items = routineOccurrences([r], [], "2026-10-07");
  assert.equal(dueReminders(items, at).length, 1);
  assert.equal(dueReminders(items, new Date("2026-10-07T01:00:00Z")).length, 0);
  for (const status of ["completed", "skipped"])
    assert.equal(
      dueReminders(
        routineOccurrences(
          [r],
          [{ routine_id: "r", due_on: "2026-10-07", status }],
          "2026-10-07",
        ),
        at,
      ).length,
      0,
    );
  const snoozed = routineOccurrences(
    [r],
    [
      {
        routine_id: "r",
        due_on: "2026-10-07",
        status: "snoozed",
        snoozed_until: "2026-10-07T00:15:00Z",
      },
    ],
    "2026-10-07",
  );
  assert.equal(dueReminders(snoozed, at).length, 0);
  assert.equal(
    dueReminders(snoozed, new Date("2026-10-07T00:16:00Z")).length,
    1,
  );
});
