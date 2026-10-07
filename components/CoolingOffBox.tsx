"use client";

import { useState, useEffect, useRef } from "react";

export interface CoolingItem {
  id: string;
  title: string;
  amount: number | null;
  reason: string;
  emotion: string;
  coolDownHours: number;
  createdAt: string;
  expiresAt: string;
  status: "cooling" | "saved" | "purchased";
}

const won = (n: number) => new Intl.NumberFormat("ko-KR").format(n) + "원";

export function coolingFromRow(row: {
  id: string;
  title: string;
  amount: number | null;
  reason: string | null;
  emotion: string;
  cool_down_hours: number;
  created_at: string;
  expires_at: string;
  status: CoolingItem["status"];
}): CoolingItem {
  return {
    id: row.id,
    title: row.title,
    amount: row.amount == null ? null : Number(row.amount),
    reason: row.reason || "",
    emotion: row.emotion,
    coolDownHours: row.cool_down_hours,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.status,
  };
}

export function CoolingOffBox({
  items,
  busy,
  onSave,
  onConvertToExpense,
}: {
  items: CoolingItem[];
  busy: boolean;
  onSave: (item: CoolingItem) => Promise<boolean>;
  onConvertToExpense: (item: CoolingItem, method: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [emotion, setEmotion] = useState("스트레스 해소");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState("");
  const newItemId = useRef(crypto.randomUUID());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = amount.trim() ? Number(amount) : null;
    if (!title.trim() || (numAmount !== null && (!numAmount || numAmount <= 0)))
      return;
    const createTime = new Date();
    const expireTime = new Date(createTime.getTime() + hours * 60 * 60 * 1000);
    const newItem: CoolingItem = {
      id: newItemId.current,
      title: title.trim(),
      amount: numAmount,
      reason: reason.trim(),
      emotion,
      coolDownHours: hours,
      createdAt: createTime.toISOString(),
      expiresAt: expireTime.toISOString(),
      status: "cooling",
    };
    if (!(await onSave(newItem))) return;
    newItemId.current = crypto.randomUUID();
    setTitle("");
    setAmount("");
    setReason("");
    setMessage("잠깐 두기에 담았어요. 다른 기기에도 같이 보여요.");
    setTimeout(() => setMessage(""), 4000);
  };

  const handleCancelAndSave = async (item: CoolingItem) => {
    if (!(await onSave({ ...item, status: "saved" }))) return;
    setMessage(
      item.amount
        ? `지금 사지 않기로 했어요. ${won(item.amount)}은 가계부에 넣지 않았어요.`
        : "지금 사지 않기로 했어요.",
    );
    setTimeout(() => setMessage(""), 5000);
  };

  const handleConfirmPurchase = async (item: CoolingItem, method: string) => {
    if (!item.amount || !method) return;
    if (!(await onConvertToExpense(item, method))) return;
    setMessage(`${item.title}을(를) 가계부 소비로 적었어요.`);
    setTimeout(() => setMessage(""), 4000);
  };

  const activeCooling = items.filter((it) => it.status === "cooling");
  const savedItems = items.filter((it) => it.status === "saved");
  const totalSavedMoney = savedItems.reduce(
    (acc, it) => acc + (it.amount || 0),
    0,
  );

  return (
    <>
      <section className="card butter">
        <p className="eyebrow">잠시 멈추고, 마음을 식히는 시간</p>
        <h2>잠깐 두기</h2>
        <p>
          사고 싶은 물건은 바로 결제하지 않고 여기에 둡니다. 금액이 없어도
          괜찮아요. 가계부 소비에는 들어가지 않아요.
        </p>
        {totalSavedMoney > 0 && (
          <p className="notice">
            사지 않고 넘어간 금액 {won(totalSavedMoney)}
          </p>
        )}
      </section>

      {message && <p role="status" className="notice">{message}</p>}

      {/* Input Form Card */}
      <section className="card capture">
        <h2>여기에 두기</h2>
        <p>지금 느끼는 감정과, 왜 사고 싶은지 적어 두세요.</p>
        <form onSubmit={handleAdd}>
          <div className="form-row">
            <label>
              사고 싶은 물건
              <input
                disabled={busy}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 무선 헤드폰, 옷, 배달 야식"
                required
              />
            </label>
            <label>
              금액(원, 없어도 돼요)
              <input
                disabled={busy}
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="아직 모르면 비워 두세요"
              />
            </label>
            <label>
              지금 느끼는 감정
              <select disabled={busy} value={emotion} onChange={(e) => setEmotion(e.target.value)}>
                <option value="스트레스">스트레스 해소</option>
                <option value="보상심리">수고한 나를 위한 보상</option>
                <option value="불안">불안 / 품절 조급함</option>
                <option value="무료함">심심함 / 무료함</option>
                <option value="진짜필요">진짜 필요한 필수품</option>
              </select>
            </label>
            <label>
              대기 시간
              <select disabled={busy} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                <option value={24}>24시간</option>
                <option value={48}>48시간</option>
                <option value={72}>72시간</option>
              </select>
            </label>
          </div>
          <label>
            하루 뒤에도 정말 필요할까요? 구매하려는 진짜 이유
            <input
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 오늘 피곤해서 충동이 드는 것 같다. 내일까지 참아보자."
            />
          </label>
          <div className="capture-footer">
            <small>여기에 있는 동안은 가계부에 넣지 않아요.</small>
            <button type="submit" disabled={busy}>잠깐 두기</button>
          </div>
        </form>
      </section>

      {/* Active Cooling-off list */}
      <section className="card">
        <h2>현재 보류 중인 항목 ({activeCooling.length}개)</h2>
        {activeCooling.length === 0 ? (
          <p className="hint">지금 두고 있는 물건이 없어요.</p>
        ) : (
          <div>
            {activeCooling.map((item) => {
              const diffMs = new Date(item.expiresAt).getTime() - now;
              const isExpired = diffMs <= 0;
              const hoursLeft = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
              const minsLeft = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
              const secsLeft = Math.max(0, Math.floor((diffMs % (1000 * 60)) / 1000));

              return (
                <div className="due" key={item.id}>
                  <div>
                    <b>{item.title}</b>
                    <small>
                      {item.amount ? won(item.amount) : "금액 없음"} · 감정:{" "}
                      {item.emotion}
                      {item.reason && ` · "${item.reason}"`}
                    </small>
                  </div>
                  <div>
                    <span className="status" style={{ fontWeight: 600 }}>
                      {isExpired
                        ? "시간이 지났어요. 다시 볼까요?"
                        : `남은 시간 ${hoursLeft}시간 ${minsLeft}분 ${secsLeft}초`}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleCancelAndSave(item)}
                    >
                      안 사기
                    </button>
                    {item.amount ? (
                      <form
                        onSubmit={async (event) => {
                          event.preventDefault();
                          const method = String(
                            new FormData(event.currentTarget).get("method") || "",
                          );
                          await handleConfirmPurchase(item, method);
                        }}
                      >
                        <select name="method" required defaultValue="" aria-label={`${item.title} 결제 수단`} disabled={busy}>
                          <option value="" disabled>
                            결제 수단
                          </option>
                          <option value="credit">카드</option>
                          <option value="cash">현금</option>
                          <option value="phone">휴대폰</option>
                          <option value="easy">간편결제</option>
                        </select>
                        <button type="submit" disabled={busy}>가계부에 적기</button>
                      </form>
                    ) : (
                      <form
                        onSubmit={async (event) => {
                          event.preventDefault();
                          const next = Number(
                            new FormData(event.currentTarget).get("amount"),
                          );
                          if (!Number.isSafeInteger(next) || next < 1) return;
                          await onSave({ ...item, amount: next });
                        }}
                      >
                        <input
                          disabled={busy}
                          name="amount"
                          type="number"
                          min="1"
                          placeholder="금액"
                          aria-label={`${item.title} 금액`}
                        />
                        <button type="submit" disabled={busy}>금액 적기</button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
