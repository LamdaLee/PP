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

const STORAGE_KEY = "pp_cooling_off_items";

export function CoolingOffBox({
  onConvertToExpense,
}: {
  onConvertToExpense: (item: { title: string; amount: number }) => Promise<void>;
}) {
  const [items, setItems] = useState<CoolingItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [emotion, setEmotion] = useState("스트레스");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const handleAdd = (e: React.FormEvent) => {
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

    setItems((prev) => [newItem, ...prev]);
    setTitle("");
    setAmount("");
    setReason("");
    setMessage("충동구매 보류함에 담았어요. 24시간 동안 잠시 마음을 식혀보아요.");
    setTimeout(() => setMessage(""), 4000);
  };

  const handleCancelAndSave = (id: string, savedAmount: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: "saved" } : it))
    );
    setMessage(`충동을 멋지게 극복하셨어요! ${new Intl.NumberFormat("ko-KR").format(savedAmount)}원을 지켰습니다.`);
    setTimeout(() => setMessage(""), 5000);
  };

  const handleConfirmPurchase = async (item: CoolingItem) => {
    await onConvertToExpense({ title: item.title, amount: item.amount });
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: "purchased" } : it))
    );
    setMessage(`${item.title}을(를) 정식 가계부 지출로 기록했습니다.`);
    setTimeout(() => setMessage(""), 4000);
  };

  const activeCooling = items.filter((it) => it.status === "cooling");
  const savedItems = items.filter((it) => it.status === "saved");
  const totalSavedMoney = savedItems.reduce((acc, it) => acc + it.amount, 0);

  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>충동구매 24시간 쿨링오프 보류함</h2>
        {totalSavedMoney > 0 && (
          <span style={{ fontSize: "0.85rem", color: "#5A7863", fontWeight: "bold" }}>
            🌱 충동 극복으로 아낀 돈: {new Intl.NumberFormat("ko-KR").format(totalSavedMoney)}원
          </span>
        )}
      </div>

      <p className="hint">
        사고 싶은 물건이 생겼을 때 바로 결제하지 않고 보류함에 넣어둡니다.
        지출에 합산되지 않으며 24시간 후에도 정말 필요한지 차분하게 재검토합니다.
      </p>

      {message && <p role="status" style={{ color: "#5A7863", fontWeight: "bold" }}>{message}</p>}

      {/* Input Form */}
      <form onSubmit={handleAdd} style={{ marginTop: "1rem" }}>
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
              <option value="불안">불안 / 조급함</option>
              <option value="무료함">심심함 / 무료함</option>
              <option value="진짜필요">진짜 필요한 필수품</option>
            </select>
          </label>
          <label>
            쿨링오프 시간
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value={24}>24시간</option>
              <option value={48}>48시간</option>
              <option value={72}>72시간</option>
            </select>
          </label>
        </div>
        <label style={{ marginTop: "0.5rem" }}>
          하루 뒤에도 정말 필요할까요? 구매하려는 진짜 이유
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 지금 피곤해서 충동이 드는 것 같다. 내일까지 참아보자."
          />
        </label>
        <button style={{ marginTop: "0.75rem" }}>보류함에 담기 (지출 유보)</button>
      </form>

      {/* Active Cooling-off list */}
      <div style={{ marginTop: "1.5rem" }}>
        <h3>현재 보류 중인 항목 ({activeCooling.length}개)</h3>
        {activeCooling.length === 0 ? (
          <p className="hint">현재 보류 중인 충동구매 항목이 없습니다. 차분한 상태예요.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: "0.5rem" }}>
            {activeCooling.map((item) => {
              const diffMs = new Date(item.expiresAt).getTime() - now;
              const isExpired = diffMs <= 0;
              const hoursLeft = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
              const minsLeft = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
              const secsLeft = Math.max(0, Math.floor((diffMs % (1000 * 60)) / 1000));

              return (
                <li
                  key={item.id}
                  className="card"
                  style={{
                    marginBottom: "0.75rem",
                    borderLeft: isExpired ? "4px solid #5A7863" : "4px solid #F4DF9F",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <b style={{ fontSize: "1.05rem" }}>{item.title}</b>
                      <span style={{ marginLeft: "0.5rem", color: "#666", fontSize: "0.9rem" }}>
                        ({new Intl.NumberFormat("ko-KR").format(item.amount)}원 · 감정: {item.emotion})
                      </span>
                      {item.reason && (
                        <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "#555" }}>
                          💭 &ldquo;{item.reason}&rdquo;
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: "bold",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          backgroundColor: isExpired ? "#EAF0EB" : "#FEF9E7",
                          color: isExpired ? "#5A7863" : "#B78103",
                        }}
                      >
                        {isExpired
                          ? "쿨링오프 완료! 재검토 시간"
                          : `남은 시간: ${hoursLeft}시간 ${minsLeft}분 ${secsLeft}초`}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                    <button
                      type="button"
                      onClick={() => handleCancelAndSave(item.id, item.amount)}
                      style={{ backgroundColor: "#5A7863", color: "#fff" }}
                    >
                      충동 극복 취소하기 (절약 완료)
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => handleConfirmPurchase(item)}
                    >
                      여전히 필요함 (가계부 지출로 기록)
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
