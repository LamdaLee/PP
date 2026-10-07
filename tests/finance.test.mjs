import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractMemo,
  moneyFromText,
  sumLedger,
  monthRange,
  koreaDate,
  scheduleOccurrences,
} from "../lib/finance.mjs";
test("명확한 구매는 지출, 욕구·질문·부정·과거 날짜는 확인 대기", () => {
  assert.equal(
    extractMemo("21000원 우산 구매", "2026-10-07")[0].status,
    "posted",
  );
  for (const text of [
    "21000원 우산 구매?",
    "21000원 우산 구매하고 싶다",
    "21000원 우산 구매 안 함",
    "어제 21000원 우산 구매",
    "21000원 우산 구매 예정",
  ])
    assert.equal(extractMemo(text)[0].status, "pending", text);
});
test("한글 금액과 혼합 기록", () => {
  assert.equal(moneyFromText("2만 1천원"), 21000);
  assert.equal(moneyFromText("월급 250만원 입금"), 2500000);
  assert.equal(extractMemo("월급 250만원 입금")[0].kind, "income");
  assert.equal(extractMemo("카드값 50만원 납부")[0].kind, "repayment");
  assert.equal(extractMemo("5000원 환불 받음")[0].kind, "refund");
  const fs = extractMemo("21000원 우산 구매\n오늘 불안하고 보고서 작성해야 해");
  assert.equal(fs.length, 2);
  assert.deepEqual(fs[1].categories, ["emotion", "work"]);
});
test("중복 소비 없이 상환 분리 및 취소 제외", () => {
  const t = sumLedger([
    { kind: "income", amount: 100000 },
    { kind: "expense", amount: 21000 },
    { kind: "repayment", amount: 21000 },
    { kind: "refund", amount: 1000 },
    { kind: "expense", amount: 9000, voided_at: "today" },
    { kind: "transfer", amount: 50000 },
  ]);
  assert.deepEqual(t, {
    income: 100000,
    expense: 21000,
    refund: 1000,
    repayment: 21000,
    net: 80000,
  });
  assert.throws(() => sumLedger([{ kind: "expense", amount: 1.5 }]));
});
test("한국 날짜·윤년·기간", () => {
  assert.equal(koreaDate(new Date("2026-10-06T16:00:00Z")), "2026-10-07");
  assert.deepEqual(monthRange("2028-02"), {
    start: "2028-02-01",
    end: "2028-02-29",
  });
  assert.throws(() => monthRange("2026-13"));
});
test("말일, 과거 미확인 일정, 완료 및 종료일 제외", () => {
  const s = {
    active: true,
    recurrence: "monthly",
    day_of_month: 31,
    start_date: "2026-01-01",
    end_date: "2026-03-31",
  };
  const dates = scheduleOccurrences(s, "2026-02-15", [
    { due_date: "2026-01-31" },
  ]);
  assert.deepEqual(
    dates.map((d) => d.due_date),
    ["2026-02-28", "2026-03-31"],
  );
  assert.equal(scheduleOccurrences(s, "2026-03-01", [])[0].overdue, true);
});
