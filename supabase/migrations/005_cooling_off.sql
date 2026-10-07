-- Migration 005: 충동구매 24시간 쿨링오프 보류함 테이블
begin;

create table if not exists public.cooling_off_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check(length(title) between 1 and 200),
  amount bigint not null check(amount > 0 and amount <= 1000000000000),
  reason text check(length(reason) <= 1000),
  emotion text not null default '스트레스',
  cool_down_hours int not null default 24,
  expires_at timestamptz not null,
  status text not null default 'cooling' check(status in ('cooling', 'saved', 'purchased')),
  created_at timestamptz not null default now()
);

create index if not exists cooling_user_status on public.cooling_off_items(user_id, status, expires_at);

alter table public.cooling_off_items enable row level security;

create policy own_select on public.cooling_off_items for select to authenticated using (user_id = (select auth.uid()));
create policy own_insert on public.cooling_off_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_update on public.cooling_off_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_delete on public.cooling_off_items for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.cooling_off_items to authenticated;
revoke all on public.cooling_off_items from anon;

commit;
