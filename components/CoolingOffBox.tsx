"use client";

import { useState, useEffect } from "react";

export interface CoolingItem {
  id: string;
  title: string;
  amount: number;
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
  amount: number;
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
    amount: Number(row.amount),
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
  onSave,
  onConvertToExpense,
}: {
  items: CoolingItem[];
  onSave: (item: CoolingItem) => Promise<boolean>;
  onConvertToExpense: (item: { title: string; amount: number }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [emotion, setEmotion] = useState("스트레스 해소");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!title.trim() || !numAmount || numAmount <= 0) return;
    const createTime = new Date();
    const expireTime = new Date(createTime.getTime() + hours * 60 * 60 * 1000);
    const newItem: CoolingItem = {
      id: crypto.randomUUID(),
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
    setTitle("");
    setAmount("");
    setReason("");
    setMessage("충동구매 보류함에 담았어요. 다른 기기에도 같이 보여요.");
    setTimeout(() => setMessage(""), 4000);
  };

  const handleCancelAndSave = async (item: CoolingItem) => {
    if (!(await onSave({ ...item, status: "saved" }))) return;
    setMessage(`충동을 멋지게 이겨내셨어요! ${won(item.amount)}을 지켰습니다.`);
    setTimeout(() => setMessage(""), 5000);
  };

  const handleConfirmPurchase = async (item: CoolingItem) => {
    await onConvertToExpense({ title: item.title, amount: item.amount });
    if (!(await onSave({ ...item, status: "purchased" }))) return;
    setMessage(`${item.title}을(를) 정식 가계부 지출로 기록했습니다.`);
    setTimeout(() => setMessage(""), 4000);
  };

  const activeCooling = items.filter((it) => it.status === "cooling");
  const savedItems = items.filter((it) => it.status === "saved");
  const totalSavedMoney = savedItems.reduce((acc, it) => acc + it.amount, 0);

  return (
    <>
      <section className="card butter">
        <p className="eyebrow">잠시 멈추고, 마음을 식히는 시간</p>
        <h2>충동구매 24시간 쿨링오프 보류함</h2>
        <p>
          사고 싶은 물건이 생겼을 때 바로 결제하지 않고 보류함에 넣어둡니다.
          가계부 지출로 합산되지 않으며, 하루 뒤에도 정말 필요한지 차분하게 재검토합니다.
        </p>
        {totalSavedMoney > 0 && (
          <p className="notice">
            🌱 충동 극복으로 아낀 금액 누적: <strong>{won(totalSavedMoney)}</strong>
          </p>
        )}
      </section>

      {message && <p role="status" className="notice">{message}</p>}

      {/* Input Form Card */}
      <section className="card capture">
        <h2>보류함에 담아두기 (지출 유보)</h2>
        <p>지금 느끼는 감정과 구매하려는 진짜 이유를 솔직하게 적어보세요.</p>
        <form onSubmit={handleAdd}>
          <div className="form-row">
            <label>
              사고 싶은 물건
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 무선 헤드폰, 옷, 배달 야식"
                required
              />
            </label>
            <label>
              금액(원)
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="예: 45000"
                required
              />
            </label>
            <label>
              지금 느끼는 감정
              <select value={emotion} onChange={(e) => setEmotion(e.target.value)}>
                <option value="스트레스">스트레스 해소</option>
                <option value="보상심리">수고한 나를 위한 보상</option>
                <option value="불안">불안 / 품절 조급함</option>
                <option value="무료함">심심함 / 무료함</option>
                <option value="진짜필요">진짜 필요한 필수품</option>
              </select>
            </label>
            <label>
              대기 시간
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                <option value={24}>24시간</option>
                <option value={48}>48시간</option>
                <option value={72}>72시간</option>
              </select>
            </label>
          </div>
          <label>
            하루 뒤에도 정말 필요할까요? 구매하려는 진짜 이유
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 오늘 피곤해서 충동이 드는 것 같다. 내일까지 참아보자."
            />
          </label>
          <div className="capture-footer">
            <small>보류함에 있는 동안은 지출로 합산되지 않습니다.</small>
            <button type="submit">24시간 보류하기</button>
          </div>
        </form>
      </section>

      {/* Active Cooling-off list */}
      <section className="card">
        <h2>현재 보류 중인 항목 ({activeCooling.length}개)</h2>
        {activeCooling.length === 0 ? (
          <p className="hint">현재 보류 중인 충동구매 항목이 없습니다. 마음이 편안한 상태예요.</p>
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
                      {won(item.amount)} · 감정: {item.emotion}
                      {item.reason && ` · "${item.reason}"`}
                    </small>
                  </div>
                  <div>
                    <span className="status" style={{ fontWeight: 600 }}>
                      {isExpired
                        ? "쿨링 완료! 재검토 시간"
                        : `남은 시간: ${hoursLeft}시간 ${minsLeft}분 ${secsLeft}초`}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => handleCancelAndSave(item)}
                    >
                      충동 극복 (절약 성공!)
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => handleConfirmPurchase(item)}
                    >
                      여전히 필요함 (지출 기록)
                    </button>
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
