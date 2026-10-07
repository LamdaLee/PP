# 🌿 Pause&Ponder (포즈앤폰더)

> **"생각함에서 시작하는 감정과 돈의 기록"**  
> 머릿속에 떠오르는 파편화된 생각을 부담 없이 털어놓고, 충동구매를 잠시 멈추며(Pause), 감정과 소비의 연결고리를 되돌아보는(Ponder) 개인 보조 도구입니다.

[![Live Demo](https://img.shields.io/badge/Demo-pauseponder.vercel.app-5A7863?style=for-the-badge&logo=vercel)](https://pauseponder.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-15+-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Auth-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Structured%20Outputs-412991?style=for-the-badge&logo=openai)](https://openai.com/)

---

## 🎯 기획 배경 및 핵심 철학

현대인의 충동 소비와 일상의 번아웃은 **복잡하고 규격화된 기록 양식에 대한 피로감**과 **감정의 동요**에서 비롯됩니다. Pause&Ponder는 다음과 같은 원칙으로 설계되었습니다.

1. **먼저 내려놓기 (Zero-Friction Inbox)**:
   * 분류나 양식을 고민하지 않고 '생각함'에 자유롭게 쏟아냅니다.
   * 원문은 그대로 보존되며, 문장/줄 단위 파편이 돈·감정·일·숨고르기로 다중 연결됩니다.
2. **충동구매 방지와 확인 대기 (Pause)**:
   * `21000원 우산 구매`는 확정 지출로 기록되지만, `21000원 우산 사고 싶다`, `우산 구매 예정?`과 같은 모호한 문장은 **'확인 대기(후보)'** 상태로 분류되어 지출에 즉시 합산되지 않습니다.
   * 구매 욕구가 일어날 때 차분히 호흡하고 자문할 수 있는 **'숨고르기'** 세션을 제공합니다.
3. **결정론적 계산 원칙 (Deterministic Calculations)**:
   * **금액 합산, 수입/지출/환불/상환 분리 계산은 AI에 맡기지 않고 순수 코드와 PostgreSQL 트랜잭션이 엄격히 수행합니다.**
   * AI는 파편 텍스트의 분류와 후보 추천에만 보조적으로 활용되며, 금융 수치의 환각(Hallucination)을 원천 차단합니다.

---

## ✨ 핵심 기능

### 1. 📥 생각함 (Core Inbox)
* 단일 입력창으로 메모, 할 일, 감정, 소비 욕구를 제약 없이 기록
* 문장/줄 단위 파편 분할 및 `돈 / 감정 / 일 / 숨고르기` 다중 태그 자동 연결
* 원문 영구 보존 및 메모 파편 추적성 보장

### 2. 💰 돈 & 가계부 (Finance Engine)
* **지출 vs 상환 분리**: 카드 물품 구매(`expense`)와 이후 카드 대금 납부(`repayment`)를 엄격히 분리하여 이중 합산 방지
* **고정 일정 관리**: 월급, 월세, 대출, 카드값 등 주기적 일정을 월별/일회성으로 설정 (31일 말일 자동 보정)
* **월별 확정 집계**: KST(Asia/Seoul) 기준 수입, 소비, 환불, 상환 분리 집계
* **멱등성 및 정합성**: 고유 요청 UUID 기반 재시도 처리로 중복 저장 방지

### 3. 🫁 숨고르기 (Breathe & Pause)
* 충동 소비 충동이 들 때 즉시 실행할 수 있는 부드러운 호흡 애니메이션 가이드
* "지금 꼭 필요한가?", "이 물건을 사면 어떤 감정이 해소되는가?" 등 구매 전 자기 점검 질문 폼

### 4. 🤖 하이브리드 파싱 (한국어 규칙 + OpenAI Structured Outputs)
* **기본 모드**: 정규식 및 형태소 기반 한국어 금융 규칙 엔진 (오프라인/경량 동작)
* **AI 모드 (선택적)**: 서버에 `OPENAI_API_KEY` 설정 시 `gpt-5-mini` + Structured Outputs 어댑터가 메모 파편의 문맥을 분석하여 후보 추출
* AI 오류나 응답 지연 시 안전하게 규칙 기반 저장으로 자동 Fallback

### 5. 🔄 실시간 동기화 & 모바일 대응
* Supabase Postgres Changes(Realtime)를 통한 다중 기기 실시간 데이터 반영
* Row Level Security(RLS)를 통한 완벽한 개인 데이터 격리
* 모바일, 태블릿, 폴더블(Galaxy Fold 등), 데스크톱 반응형 레이아웃 대응
* **Android 동반 앱 (v0.3)**: 루틴 추적 및 알림 연동 지원

---

## 🛠 기술 스택

| 영역 | 기술 스택 | 설명 |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 15 (App Router)**, React, TypeScript | 반응형 SPA/웹앱 및 Route Handler API |
| **Styling** | **Tailwind CSS** | 따뜻한 자연 톤 팔레트 (Sage Green, Butter, Sand) |
| **Database & Auth** | **Supabase (PostgreSQL, RLS)** | 행 단위 보안 정책, ACID 트랜잭션 RPC, Realtime |
| **AI Integration** | **OpenAI Responses API** (`gpt-5-mini`) | JSON Schema 기반 Structured Outputs 파싱 보조 |
| **Mobile** | **Android Native (Kotlin)** | v0.3 일상 루틴 및 기기 동반 앱 |
| **Deployment** | **Vercel** + **Supabase Cloud** | 서버리스 인프라 배포 |

---

## 📁 주요 디렉터리 및 아키텍처

```text
├── app/
│   ├── api/data/route.ts       # 토큰 검증, 세션 인가, 메모/거래 CRUD API
│   ├── layout.tsx              # 전역 레이아웃 및 폰트 설정
│   └── page.tsx                # 메인 대시보드 진입점
├── components/
│   └── Dashboard.tsx           # 생각함, 가계부, 숨고르기, 거래 내역 핵심 UI
├── lib/
│   ├── finance.mjs             # 금액 추출, 규칙 기반 분류, 월별 집계, 납부일 계산 엔진
│   └── ai.mjs                  # OpenAI Structured Outputs 파서 어댑터
├── supabase/
│   ├── schema.sql              # 테이블 정의, RLS 보안 규칙, 저장 프로시저(RPC)
│   └── migrations/             # 마이그레이션 스크립트 (루틴 등)
└── android/                    # Android 동반 앱 소스 코드



