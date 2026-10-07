# Pause&Ponder v0.3 검증 — 2026-10-07

웹 자동 테스트 12개 통과, Next.js 프로덕션 빌드와 TypeScript 검사 통과. /, /api/data, /api/routines, /api/client-config 생성.

- 기존 규칙/원화 금액/한국 날짜/월별 계산/카드 상환 분리/정기 일정/거래 취소 동작 검증 유지.
- AI는 모의 Responses 성공·실패·거절·incomplete, 원문/확정 거래 보존, 확인 후보만 추가, 키 없음 fallback 검증. 사용자도 이전 운영 웹 AI 동작을 확인. 이번 추가 기능은 실제 유료 API를 호출해 검증하지 않음.
- PostgreSQL(PGlite): 기존 base schema 위 추가 SQL 두 번 실행, RLS 사용자 분리/익명 권한 차단/다른 사용자 수정 거부, 루틴 상태 요청 중복 방지, 미래 날짜 거부, 다른 기기 충돌, 미룸·완료 시간, 지연 재시도 시 클라이언트 미룸 시각 보존 검증.
- 루틴 시간 함수: 요일/날짜/시작·종료/중단, 완료·건너뜀 제외, 미룸 시각 변경, 오래된 알림 제외.
- 날짜별 기록은 날짜 필터로 서버 재조회하므로 최근 1000건 캐시 밖의 날짜도 조회. 당일 1000건 이상 루틴은 페이지네이션 필요.

로컬 SQL 테스트는 Supabase Auth.uid와 역할을 모사하며 pgcrypto extension/publication 변경을 제외한다. 실제 Supabase Realtime publication, 인증 만료/회복, 두 기기 경쟁 부하, Vercel 추가 API 연결은 미검증이다. 기존 가계부는 Supabase 기본 조회 한도에 대한 장기 자료 페이지네이션/서버 집계가 추가로 필요하다.

운영 추가 검증: ROUTINES_ANDROID_UPDATE.txt 5번. 기존 DB에서 schema.sql 재실행 금지. 003_routines.sql 적용 후 웹 등록·수정·중단·완료·미룸·건너뜀·되돌리기·날짜 기록, 같은 계정 두 열린 기기의 동기화, 다른 사용자 접근 거부 확인.

Android의 실제 기기 알림 전달, 위젯 런처/폴더블 크기, 절전·재부팅·강제 중지·알림 권한·정확한 알림 권한과 네이티브 UI/TalkBack 검증은 미수행이다. 앱 종료 상태 서버 변경은 WorkManager/OS에 따라 지연된다. Android 앱이 열린 동안 Realtime으로 조회하는 소스 구현은 실제 Supabase WebSocket로 검증하지 않았다.

## Android 빌드 결과

`testDebugUnitTest assembleDebug` 성공 (AGP 8.9.2, Gradle 8.11.1, JDK 17, SDK 35). Java 네이티브 소스/manifest/resources/dex/APK 생성 통과. 한국 자정/예약 시각, 반복 요일/시작·종료/다음 날짜의 JVM 테스트 2개 통과. 생성 APK는 debug 서명의 개인 테스트용이며 실기기 실행 결과가 아니다. 컴파일 때 Android UI deprecated API 안내가 있으나 오류는 없다.
