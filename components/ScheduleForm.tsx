"use client";

import { useRef } from "react";
import { koreaDate } from "@/lib/finance.mjs";

export function ScheduleForm({
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
