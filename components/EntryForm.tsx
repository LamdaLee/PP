"use client";

import { useRef } from "react";
import { koreaDate } from "@/lib/finance.mjs";
import type { Memo, Fragment } from "@/lib/types";

const labels: Record<string, string> = {
  expense: "지출",
  income: "수입",
  refund: "환불",
  repayment: "대금·상환",
  transfer: "이체",
};

export function EntryForm({
  candidate,
  busy,
  onSave,
  onCancel,
}: {
  candidate: { memo: Memo; fragment: Fragment } | null;
  busy: boolean;
  onSave: (b: unknown) => Promise<boolean>;
  onCancel: () => void;
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
          action: "entry",
          requestId: id.current,
          title: f.get("title"),
          kind: f.get("kind"),
          amount: Number(f.get("amount")),
          date: f.get("date"),
          method: f.get("method"),
          memoId: candidate?.memo.id,
          fragment: candidate?.fragment.id,
        });
        if (ok) {
          id.current = crypto.randomUUID();
          form.reset();
        }
      }}
    >
      <h2>{candidate ? "메모를 확인하고 기록" : "직접 기록하기"}</h2>
      <label>
        내용
        <input
          disabled={busy}
          name="title"
          defaultValue={candidate?.fragment.text || ""}
          maxLength={500}
          required
        />
      </label>
      <div className="form-row">
        <label>
          종류
          <select
            disabled={busy}
            name="kind"
            defaultValue={candidate?.fragment.kind || "expense"}
          >
            {["expense", "income", "refund", "repayment", "transfer"].map(
              (k) => (
                <option value={k} key={k}>
                  {labels[k]}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          금액(원)
          <input
            disabled={busy}
            name="amount"
            type="number"
            min="1"
            max="1000000000000"
            step="1"
            defaultValue={candidate?.fragment.amount || ""}
            required
          />
        </label>
        <label>
          발생일
          <input disabled={busy} name="date" type="date" defaultValue={koreaDate()} required />
        </label>
        <label>
          결제 수단
          <select disabled={busy} name="method" defaultValue="cash" required>
            <option value="credit">카드</option>
            <option value="cash">현금</option>
            <option value="phone">휴대폰</option>
            <option value="easy">간편결제</option>
          </select>
        </label>
      </div>
      <button disabled={busy}>가계부에 기록</button>
      {candidate && (
        <button type="button" disabled={busy} className="text-button" onClick={onCancel}>
          나중에 확인
        </button>
      )}
    </form>
  );
}
