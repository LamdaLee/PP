"use client";

import { useEffect, useRef, useState } from "react";
import { browserDraftStorage, readEntryDraft, writeEntryDraft } from "@/lib/drafts.mjs";
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
  userId,
  busy,
  onSave,
  onCancel,
}: {
  candidate: { memo: Memo; fragment: Fragment } | null;
  userId: string;
  busy: boolean;
  onSave: (b: unknown) => Promise<boolean>;
  onCancel: () => void;
}) {
  const id = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState("");
  const manual = !candidate;
  useEffect(() => {
    if (manual) {
      const saved = readEntryDraft(browserDraftStorage(), userId);
      if (saved) {
        for (const [name, value] of Object.entries(saved.fields)) {
          const field = formRef.current?.elements.namedItem(name);
          if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value = String(value);
        }
        id.current = saved.requestId;
        setPending(!!saved.requestId);
      }
    }
    setReady(true);
  }, [userId, manual]);
  function persist(form: HTMLFormElement, requestId = id.current) {
    if (!manual) return true;
    const data = new FormData(form);
    const fields = Object.fromEntries(["title", "kind", "amount", "date", "method"].map(name => [name, String(data.get(name) || "")]));
    const ok = writeEntryDraft(browserDraftStorage(), userId, { fields, requestId });
    setWarning(ok ? "" : "이 기기에 초안을 보관하지 못했어요. 화면을 닫기 전에 저장해 주세요.");
    return ok;
  }
  const locked = busy || !ready || (manual && pending);
  return (
    <form
      className="card"
      ref={formRef}
      onChange={(e) => persist(e.currentTarget)}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form);
        if (!id.current) id.current = crypto.randomUUID();
        if (manual && !pending && !persist(form)) return;
        setPending(true);
        const saved = manual && pending ? readEntryDraft(browserDraftStorage(), userId) : null;
        if (manual && pending && !saved) { setWarning("저장 요청 초안을 읽지 못했어요. 가계부에서 저장 상태를 먼저 확인해 주세요."); return; }
        const value = (name: string) => saved?.fields[name] ?? f.get(name);
        const ok = await onSave({
          action: "entry",
          requestId: id.current,
          title: value("title"),
          kind: value("kind"),
          amount: Number(value("amount")),
          date: value("date"),
          method: value("method"),
          memoId: candidate?.memo.id,
          fragment: candidate?.fragment.id,
        });
        if (ok) {
          id.current = "";
          setPending(false);
          if (manual) writeEntryDraft(browserDraftStorage(), userId, null);
          form.reset();
        }
      }}
    >
      <h2>{candidate ? "메모를 확인하고 기록" : "직접 기록하기"}</h2>
      <label>
        내용
        <input
          disabled={locked}
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
            disabled={locked}
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
            disabled={locked}
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
          <input disabled={locked} name="date" type="date" defaultValue={koreaDate()} required />
        </label>
        <label>
          결제 수단
          <select disabled={locked} name="method" defaultValue="cash" required>
            <option value="credit">카드</option>
            <option value="cash">현금</option>
            <option value="phone">휴대폰</option>
            <option value="easy">간편결제</option>
          </select>
        </label>
      </div>
      {pending && manual && <p className="hint">저장 결과가 확인되지 않은 입력을 복구했어요. 같은 내용으로 다시 확인하면 중복으로 적지 않아요.</p>}
      {warning && <p role="status" className="hint">{warning}</p>}
      <button disabled={busy || !ready}>{pending ? "같은 요청으로 다시 확인" : "가계부에 기록"}</button>
      {manual && <button type="button" disabled={busy || !ready} className="text-button" onClick={() => {
        if (pending && !window.confirm("이미 저장됐을 수도 있어요. 가계부에서 먼저 확인한 뒤 초안을 버릴까요?")) return;
        if (!writeEntryDraft(browserDraftStorage(), userId, null)) { setWarning("초안을 지우지 못했어요."); return; }
        id.current = ""; setPending(false); setWarning(""); formRef.current?.reset();
      }}>초안 버리기</button>}
      {candidate && (
        <button type="button" disabled={locked} className="text-button" onClick={onCancel}>
          나중에 확인
        </button>
      )}
    </form>
  );
}
