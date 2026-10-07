"use client";

export function BreatheModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="숨고르기">
      <div className="dialog grounding">
        <div className="breath-orb" />
        <h2>편하게 숨을 쉬어요.</h2>
        <p>
          지금 무엇을 느끼고 있나요?
          <br />
          결정은 잠시 뒤로 미뤄도 괜찮아요.
        </p>
        <button autoFocus onClick={onClose}>
          조금 차분해졌어요
        </button>
      </div>
    </div>
  );
}
