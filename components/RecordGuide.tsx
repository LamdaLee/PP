"use client";

export function FirstUseExample() {
  return (
    <details className="card content-fold first-use">
      <summary>어떻게 적으면 될까요? 예시 보기</summary>
      <p className="eyebrow">저장되지 않는 사용 예시</p>
      <blockquote>우산 사고 싶다. 오늘은 조금 불안하다. 보고서도 써야 한다.</blockquote>
      <ul className="example-results">
        <li><b>구매 희망</b> 우산은 잠깐 두기에 보관해요. 구매 희망만으로 지출을 적지 않아요.</li>
        <li><b>감정</b> 불안하다는 말은 감정 기록으로 남아요.</li>
        <li><b>할 일</b> 보고서 작성은 할 일과 루틴에서 확인해요.</li>
      </ul>
      <p className="hint">실제 분류는 입력 내용에 따라 달라질 수 있어요. 저장한 원문과 분류를 확인하고 고칠 수 있어요.</p>
    </details>
  );
}

export function RecordGuide() {
  return (
    <details className="card content-fold">
      <summary>기록 보관과 삭제 안내</summary>
      <p>저장한 메모와 가계부·구매 보류·할 일 기록은 로그인한 계정의 서버 기록으로 보관해요. 같은 계정으로 다른 기기에서도 볼 수 있어요.</p>
      <p>작성 중인 마음함·직접 거래 초안은 이 브라우저에 계정별로 보관해요. 다른 기기와 동기화되지 않고, 브라우저 저장소를 지우면 복구할 수 없어요.</p>
      <p>메모의 ‘지우기’는 원문을 삭제해요. 이미 가계부에 기록한 거래는 남으므로 가계부에서 별도로 취소해 주세요.</p>
      <p className="hint">자동 분류 서비스가 활성화된 경우 메모 내용이 외부 AI 서비스로 전달됩니다. 비밀번호나 인증번호는 기록하지 마세요.</p>
    </details>
  );
}
