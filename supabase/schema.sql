-- Run in a NEW Supabase project. No tables from previous unrelated projects are reused.
create extension if not exists pgcrypto;
create table public.memos (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 request_id uuid not null, body text not null check(length(body) between 1 and 10000), fragments jsonb not null default '[]',
 created_at timestamptz not null default now(), unique(user_id,request_id), unique(user_id,id)
);
create table public.entries (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 request_id uuid not null, title text not null check(length(title) between 1 and 500),
 kind text not null check(kind in ('income','expense','refund','repayment','transfer')),
 amount bigint not null check(amount>0 and amount<=1000000000000), occurred_on date not null,
 payment_method text not null default 'cash' check(payment_method in ('cash','debit','credit','account')),
 memo_id uuid, fragment_id text, voided_at timestamptz,
 created_at timestamptz not null default now(), unique(user_id,request_id), unique(memo_id,fragment_id), unique(user_id,id), foreign key(user_id,memo_id) references public.memos(user_id,id),
 check((memo_id is null)=(fragment_id is null))
);
create table public.schedules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200), kind text not null check(kind in ('salary','rent','loan','credit','other')),
 amount bigint not null check(amount>0 and amount<=1000000000000), recurrence text not null check(recurrence in ('once','monthly')),
 day_of_month int check(day_of_month between 1 and 31), start_date date not null, end_date date,
 active boolean not null default true, created_at timestamptz not null default now(), unique(user_id,id),
 check(end_date is null or end_date>=start_date), check((recurrence='monthly' and day_of_month is not null) or (recurrence='once' and day_of_month is null))
);
create table public.settlements (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 schedule_id uuid not null, due_date date not null,
 entry_id uuid not null, unique(schedule_id,due_date), foreign key(user_id,schedule_id) references public.schedules(user_id,id), foreign key(user_id,entry_id) references public.entries(user_id,id)
);
create index entries_user_month on public.entries(user_id,occurred_on);
create index memos_user_time on public.memos(user_id,created_at desc);
do $$ declare t text;begin foreach t in array array['memos','entries','schedules','settlements'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy own_select on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
 execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',t);
 execute format('create policy own_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
 execute format('grant select, insert, update on public.%I to authenticated',t);
 execute format('revoke all on public.%I from anon',t);
 end loop;end $$;

create policy own_delete on public.settlements for delete to authenticated using (user_id=(select auth.uid()));
grant delete on public.settlements to authenticated;

create or replace function public.save_memo(p_request_id uuid,p_body text,p_fragments jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare mid uuid; f jsonb; oldbody text;begin
 if auth.uid() is null then raise exception '로그인이 필요합니다';end if;
 if jsonb_typeof(p_fragments)<>'array' or jsonb_array_length(p_fragments)>1000 then raise exception '분류 형식 오류';end if;
 insert into memos(request_id,body,fragments) values(p_request_id,p_body,p_fragments) on conflict(user_id,request_id) do nothing returning id into mid;
 if mid is null then select id,body into mid,oldbody from memos where user_id=auth.uid() and request_id=p_request_id;
   if oldbody is distinct from p_body then raise exception '요청 ID가 다른 메모에 사용되었습니다';end if;return mid;end if;
 for f in select value from jsonb_array_elements(p_fragments) loop
   if f->>'status'='posted' then
     insert into entries(request_id,title,kind,amount,occurred_on,memo_id,fragment_id)
     values(gen_random_uuid(),left(f->>'text',500),f->>'kind',(f->>'amount')::bigint,(f->>'date')::date,mid,f->>'id');
   end if;
 end loop;return mid;end $$;

create or replace function public.save_entry(p_request_id uuid,p_title text,p_kind text,p_amount bigint,p_date date,p_method text default 'cash',p_memo_id uuid default null,p_fragment text default null) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare eid uuid; n memos; oldentry entries;begin
 if auth.uid() is null then raise exception '로그인이 필요합니다';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_request_id::text,0));
 if p_memo_id is not null then
   select * into n from memos where id=p_memo_id and user_id=auth.uid() for update;
   if n.id is null or not exists(select 1 from jsonb_array_elements(n.fragments) f where f->>'id'=p_fragment) then raise exception '원문 메모가 없습니다';end if;
 end if;
 select * into oldentry from entries where user_id=auth.uid() and request_id=p_request_id;
 if oldentry.id is not null then
   if oldentry.title is distinct from p_title or oldentry.kind is distinct from p_kind or oldentry.amount is distinct from p_amount or oldentry.occurred_on is distinct from p_date or oldentry.payment_method is distinct from p_method or oldentry.memo_id is distinct from p_memo_id or oldentry.fragment_id is distinct from p_fragment then raise exception '요청 ID가 다른 거래에 사용되었습니다';end if;
   return oldentry.id;
 end if;
 insert into entries(request_id,title,kind,amount,occurred_on,payment_method,memo_id,fragment_id)
 values(p_request_id,p_title,p_kind,p_amount,p_date,p_method,p_memo_id,p_fragment) on conflict do nothing returning id into eid;
 if eid is null then select id into eid from entries where user_id=auth.uid() and ((request_id=p_request_id) or (memo_id=p_memo_id and fragment_id=p_fragment));end if;
 if exists(select 1 from entries where id=eid and voided_at is not null) then raise exception '취소한 원문은 다시 반영할 수 없습니다. 새 기록을 작성해 주세요';end if;
 if p_memo_id is not null then update memos set fragments=(select jsonb_agg(case when f->>'id'=p_fragment then jsonb_set(f,'{status}','"posted"') else f end) from jsonb_array_elements(fragments) f) where id=p_memo_id;end if;
 return eid;end $$;

create or replace function public.void_entry(p_id uuid) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare e entries;begin
 select * into e from entries where id=p_id and user_id=auth.uid() for update;
 if e.id is null then raise exception '거래가 없습니다';end if;
 update entries set voided_at=now() where id=p_id;
 delete from settlements where entry_id=p_id and user_id=auth.uid();
 if e.memo_id is not null then update memos set fragments=(select jsonb_agg(case when f->>'id'=e.fragment_id then jsonb_set(f,'{status}','"voided"') else f end) from jsonb_array_elements(fragments) f) where id=e.memo_id;end if;
end $$;

create or replace function public.settle_schedule(p_schedule uuid,p_due date,p_date date,p_request uuid) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s schedules; eid uuid; expected_day int;begin
 select * into s from schedules where id=p_schedule and user_id=auth.uid() for update;
 if s.id is null or not s.active then raise exception '예정 항목이 없습니다';end if;
 if p_due<s.start_date or (s.end_date is not null and p_due>s.end_date) then raise exception '예정 기간을 확인해 주세요';end if;
 if s.recurrence='once' and p_due<>s.start_date then raise exception '예정 날짜가 일치하지 않습니다';end if;
 expected_day=least(s.day_of_month,extract(day from (date_trunc('month',p_due)+interval '1 month - 1 day'))::int);
 if s.recurrence='monthly' and extract(day from p_due)::int<>expected_day then raise exception '월별 예정 날짜가 일치하지 않습니다';end if;
 select entry_id into eid from settlements where schedule_id=p_schedule and due_date=p_due;
 if eid is not null then return eid;end if;
 eid=save_entry(p_request,s.title,case when s.kind='salary' then 'income' when s.kind in ('loan','credit') then 'repayment' else 'expense' end,s.amount,p_date,'account');
 insert into settlements(schedule_id,due_date,entry_id) values(p_schedule,p_due,eid);
 return eid;end $$;
create or replace function public.save_schedule(p_request uuid,p_title text,p_kind text,p_amount bigint,p_recurrence text,p_day int,p_start date,p_end date) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s schedules;begin
 if auth.uid() is null then raise exception '로그인이 필요합니다';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_request::text,0));
 select * into s from schedules where id=p_request;
 if s.id is not null then
 if s.title is distinct from p_title or s.kind is distinct from p_kind or s.amount is distinct from p_amount or s.recurrence is distinct from p_recurrence or s.day_of_month is distinct from p_day or s.start_date is distinct from p_start or s.end_date is distinct from p_end then raise exception '요청 ID가 다른 일정에 사용되었습니다';end if;
 return s.id;end if;
 insert into schedules(id,title,kind,amount,recurrence,day_of_month,start_date,end_date) values(p_request,p_title,p_kind,p_amount,p_recurrence,p_day,p_start,p_end);
 return p_request;end $$;
revoke all on function public.save_schedule(uuid,text,text,bigint,text,int,date,date) from public,anon;
grant execute on function public.save_schedule(uuid,text,text,bigint,text,int,date,date) to authenticated;
revoke all on function public.save_memo(uuid,text,jsonb),public.save_entry(uuid,text,text,bigint,date,text,uuid,text),public.void_entry(uuid),public.settle_schedule(uuid,date,date,uuid) from public,anon;
grant execute on function public.save_memo(uuid,text,jsonb),public.save_entry(uuid,text,text,bigint,date,text,uuid,text),public.void_entry(uuid),public.settle_schedule(uuid,date,date,uuid) to authenticated;
create or replace function public.ledger_totals(p_start date, p_end date)
returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
 if p_start is null or p_end is null or p_end < p_start then
   raise exception '조회 기간을 확인해 주세요';
 end if;
 select jsonb_build_object(
   'income', coalesce(sum(amount) filter (where kind='income'),0),
   'expense', coalesce(sum(amount) filter (where kind='expense'),0),
   'refund', coalesce(sum(amount) filter (where kind='refund'),0),
   'repayment', coalesce(sum(amount) filter (where kind='repayment'),0),
   'transfer', coalesce(sum(amount) filter (where kind='transfer'),0),
   'count', count(*)::int
 ) into result
 from entries
 where user_id=auth.uid() and voided_at is null and occurred_on between p_start and p_end;
 return result || jsonb_build_object(
   'net', (result->>'income')::bigint + (result->>'refund')::bigint - (result->>'expense')::bigint
 );
end $$;
revoke all on function public.ledger_totals(date,date) from public,anon;
grant execute on function public.ledger_totals(date,date) to authenticated;
-- Add only these tables to Realtime. Preserve any other project's publication tables.
do $$declare t text;begin foreach t in array array['memos','entries','schedules','settlements'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
end loop;end $$;
