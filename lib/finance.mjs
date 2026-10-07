export function koreaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw Error("올바른 월을 선택해 주세요.");
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${end}` };
}
export function sumLedger(rows) {
  const result = { income: 0, expense: 0, refund: 0, repayment: 0, net: 0 };
  for (const row of rows) {
    if (!Number.isSafeInteger(row.amount) || row.amount <= 0)
      throw Error("금액은 양의 정수여야 합니다.");
    if (row.voided_at) continue;
    if (Object.hasOwn(result, row.kind) && row.kind !== "net")
      result[row.kind] += row.amount;
  }
  result.net = result.income + result.refund - result.expense;
  return result;
}
export function moneyFromText(text) {
  const m = text.match(
    /((?:\d[\d,]*(?:\.\d+)?\s*(?:억|만|천)\s*)*\d[\d,]*(?:\.\d+)?\s*(?:억|만|천)?|(?:\d[\d,]*(?:\.\d+)?\s*(?:억|만|천)\s*)+)\s*원/,
  );
  if (!m) return null;
  const pieces =
    m[1].replace(/,/g, "").match(/\d+(?:\.\d+)?\s*(?:억|만|천)?/g) || [];
  const n = pieces.reduce(
    (s, p) =>
      s +
      Number(p.match(/\d+(?:\.\d+)?/)[0]) *
        (p.includes("억")
          ? 1e8
          : p.includes("만")
            ? 1e4
            : p.includes("천")
              ? 1e3
              : 1),
    0,
  );
  return Number.isSafeInteger(n) && n > 0 && n <= 1e12 ? n : null;
}
export function extractMemo(text, date = koreaDate()) {
  // Deterministic explicit cases only; AI can later supply candidates, never totals.
  return text
    .split(/\n|[。]|[.;](?=\s|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((fragment, index) => {
      const amount = moneyFromText(fragment);
      const categories = [];
      if (amount || /카드|급여|월급|지출|구매|대출|돈/.test(fragment))
        categories.push("money");
      if (/불안|감정|지쳐|지쳤|지친|우울|기분|피곤/.test(fragment))
        categories.push("emotion");
      if (/보고서|회의|업무|제출|마감|할 일|작성|메일/.test(fragment))
        categories.push("work");
      if (/숨|호흡|충동|휴식|쉬고|멈춤/.test(fragment))
        categories.push("breathe");
      if (!categories.length) categories.push("thought");
      let kind = null;
      if (amount) {
        if (/카드\s*(?:값|대금)|대출\s*(?:상환|원금)/.test(fragment))
          kind = "repayment";
        else if (/환불|반품/.test(fragment)) kind = "refund";
        else if (/월급|급여|입금|수입/.test(fragment)) kind = "income";
        else if (/구매|샀|구입|결제|썼|지출|사용/.test(fragment))
          kind = "expense";
      }
      const ambiguous =
        /같아|쯤|정도|기억|아마|싶|예정|할까|계획|해야|내일|결제일|안\s*(?:샀|했|썼|함|해|할)|않|안함|취소|거절|실패|\?|어제|지난|지난달|\d{1,2}\s*월|\d{1,2}\s*일|\d{4}-\d{2}-\d{2}/.test(
          fragment,
        ) || (fragment.match(/원/g) || []).length > 1;
      if (
        kind === "repayment" &&
        !/납부|상환\s*(?:했|완료)|냈|지급|결제\s*(?:했|완료)/.test(fragment)
      )
        kind = null;
      if (kind === "income" && !/입금|들어|받|수입|완료/.test(fragment))
        kind = null;
      if (kind === "refund" && !/완료|들어|받/.test(fragment)) kind = null;
      return {
        id: `f${index}`,
        text: fragment,
        categories,
        amount,
        kind,
        date,
        status: kind && !ambiguous ? "posted" : amount ? "pending" : "note",
      };
    });
}
export function scheduleOccurrences(schedule, today, settlements = []) {
  if (!schedule.active) return [];
  const [y, m] = today.split("-").map(Number);
  const paid = new Set(settlements.map((s) => s.due_date));
  const dates = [];
  if (schedule.recurrence === "once") dates.push(schedule.start_date);
  else
    for (
      let offset = Math.max(
        -1200,
        (Number(schedule.start_date.slice(0, 4)) - y) * 12 +
          Number(schedule.start_date.slice(5, 7)) -
          m,
      );
      offset <= 1;
      offset++
    ) {
      const d = new Date(Date.UTC(y, m - 1 + offset, 1));
      const yy = d.getUTCFullYear(),
        mm = d.getUTCMonth() + 1;
      const day = Math.min(
        schedule.day_of_month,
        new Date(Date.UTC(yy, mm, 0)).getUTCDate(),
      );
      dates.push(
        `${yy}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      );
    }
  return dates
    .filter(
      (date) =>
        date >= schedule.start_date &&
        (!schedule.end_date || date <= schedule.end_date) &&
        !paid.has(date),
    )
    .map((date) => ({ ...schedule, due_date: date, overdue: date < today }));
}
