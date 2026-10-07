-- ADDITIVE migration for existing v0.2.x installations. Never rerun schema.sql.
begin;
create table if not exists public.routines (
 id uuid primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 120), local_time time(0) not null,
 weekdays int[] not null check(cardinality(weekdays)>0 and weekdays <@ array[1,2,3,4,5,6,7]),
 timezone text not null default 'Asia/Seoul' check(timezone='Asia/Seoul'), start_date date not null, end_date date,
 reminder_enabled boolean not null default true, active boolean not null default true,
 updated_at timestamptz not null default now(), created_at timestamptz not null default now(),
 unique(user_id,id), check(end_date is null or end_date>=start_date)
);
create table if not exists public.routine_logs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 routine_id uuid not null, due_on date not null, status text not null check(status in ('completed','skipped','snoozed','pending')),
 completed_at timestamptz, snoozed_until timestamptz, updated_at timestamptz not null default now(),
 unique(routine_id,due_on), foreign key(user_id,routine_id) references public.routines(user_id,id),
 check((status='completed')=(completed_at is not null)), check((status='snoozed')=(snoozed_until is not null))
);
create table if not exists public.routine_actions (
 request_id uuid not null, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 routine_id uuid not null, due_on date not null, status text not null,
 created_at timestamptz not null default now(), primary key(user_id,request_id),
 foreign key(user_id,routine_id) references public.routines(user_id,id)
);
create index if not exists routine_logs_user_date on public.routine_logs(user_id,due_on);
do $$declare t text;begin foreach t in array array['routines','routine_logs','routine_actions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('drop policy if exists own_select on public.%I',t);
 execute format('drop policy if exists own_insert on public.%I',t);
 execute format('drop policy if exists own_update on public.%I',t);
 execute format('create policy own_select on public.%I for select to authenticated using(user_id=(select auth.uid()))',t);
 execute format('create policy own_insert on public.%I for insert to authenticated with check(user_id=(select auth.uid()))',t);
 execute format('create policy own_update on public.%I for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('revoke all on public.%I from anon',t);
 end loop;end $$;
create or replace function public.save_routine(p_id uuid,p_title text,p_time time,p_days int[],p_start date,p_end date,p_reminder boolean,p_active boolean default true) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if auth.uid() is null then raise exception '로그인이 필요합니다';end if;
 insert into routines(id,title,local_time,weekdays,start_date,end_date,reminder_enabled,active)
 values(p_id,p_title,p_time,(select array_agg(distinct d order by d) from unnest(p_days) d),p_start,p_end,p_reminder,p_active)
 on conflict(id) do update set title=excluded.title,local_time=excluded.local_time,weekdays=excluded.weekdays,start_date=excluded.start_date,end_date=excluded.end_date,reminder_enabled=excluded.reminder_enabled,active=excluded.active,updated_at=now();
 return p_id;end $$;
create or replace function public.set_routine_status(p_request uuid,p_routine uuid,p_due date,p_status text,p_completed_at timestamptz default null,p_expected text default null,p_snoozed_until timestamptz default null) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r routines; a routine_actions; previous routine_logs;begin
 if auth.uid() is null then raise exception '로그인이 필요합니다';end if;
 select * into r from routines where id=p_routine and user_id=auth.uid() for update;
 if r.id is null then raise exception '루틴이 없습니다';end if;
 select * into a from routine_actions where user_id=auth.uid() and request_id=p_request;
 if a.request_id is not null then
 if a.routine_id is distinct from p_routine or a.due_on is distinct from p_due or a.status is distinct from p_status then raise exception '다른 작업에 사용된 요청 ID입니다';end if;return;end if;
 if p_status not in ('completed','skipped','snoozed','pending') then raise exception '상태를 확인해 주세요';end if;
 if p_due<r.start_date or (r.end_date is not null and p_due>r.end_date) or not (extract(isodow from p_due)::int=any(r.weekdays)) or p_due>(now() at time zone 'Asia/Seoul')::date then raise exception '루틴 날짜를 확인해 주세요';end if;
 if p_snoozed_until is not null and (p_snoozed_until>now()+interval '15 minutes' or p_snoozed_until<(p_due::timestamp at time zone 'Asia/Seoul')) then raise exception '미루기 시간을 확인해 주세요';end if;
 if p_status='snoozed' and (not r.active or not r.reminder_enabled or p_due<>(now() at time zone 'Asia/Seoul')::date) then raise exception '오늘 알림이 켜진 루틴만 미룰 수 있습니다';end if;
 select * into previous from routine_logs where routine_id=p_routine and due_on=p_due;
 if p_expected='absent' and previous.id is not null then raise exception '다른 기기에서 이미 변경되었습니다. 최신 기록을 확인해 주세요';end if;
 if p_expected is not null and p_expected<>'absent' and (previous.id is null or previous.updated_at is distinct from p_expected::timestamptz) then raise exception '다른 기기에서 이미 변경되었습니다. 최신 기록을 확인해 주세요';end if;
 if p_completed_at is not null and (p_completed_at>now()+interval '5 minutes' or p_completed_at<(p_due::timestamp at time zone 'Asia/Seoul')) then raise exception '완료 시간을 확인해 주세요';end if;
 insert into routine_actions(request_id,routine_id,due_on,status) values(p_request,p_routine,p_due,p_status);
 insert into routine_logs(routine_id,due_on,status,completed_at,snoozed_until)
 values(p_routine,p_due,p_status,case when p_status='completed' then coalesce(p_completed_at,now()) else null end,case when p_status='snoozed' then coalesce(p_snoozed_until,now()+interval '10 minutes') else null end)
 on conflict(routine_id,due_on) do update set status=excluded.status,completed_at=excluded.completed_at,snoozed_until=excluded.snoozed_until,updated_at=now();
end $$;
revoke all on function public.save_routine(uuid,text,time,int[],date,date,boolean,boolean),public.set_routine_status(uuid,uuid,date,text,timestamptz,text,timestamptz) from public,anon;
grant execute on function public.save_routine(uuid,text,time,int[],date,date,boolean,boolean),public.set_routine_status(uuid,uuid,date,text,timestamptz,text,timestamptz) to authenticated;
-- Realtime publication (omit only in local engine tests).
do $$declare t text;begin foreach t in array array['routines','routine_logs'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
 end loop;end $$;
commit;
