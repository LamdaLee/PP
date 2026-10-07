-- Migration 004: 10만 건 이상 대규모 누적 데이터를 위한 고성능 복합 인덱스
begin;

-- 1. 월별 및 커서 기반 역순 탐색 인덱스
create index if not exists entries_user_occurred_created 
  on public.entries(user_id, occurred_on desc, created_at desc);

-- 2. 생각함 타임라인 커서 탐색 인덱스
create index if not exists memos_user_created_cursor 
  on public.memos(user_id, created_at desc, id desc);

-- 3. 가계부 유형별(수입/소비/상환) 빠른 합산 부분 인덱스
create index if not exists entries_user_kind_occurred 
  on public.entries(user_id, kind, occurred_on desc) 
  where voided_at is null;

commit;
