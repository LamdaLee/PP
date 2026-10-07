-- ADDITIVE. Existing databases only. Never rerun schema.sql.
begin;
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

create or replace function public.save_routine(p_id uuid,p_title text,p_time time,p_days int[],p_start date,p_end date,p_reminder boolean,p_active boolean default true) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare rid uuid;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다';end if;
 insert into routines(id,title,local_time,weekdays,start_date,end_date,reminder_enabled,active)
 values(p_id,p_title,p_time,(select array_agg(distinct d order by d) from unnest(p_days) d),p_start,p_end,p_reminder,p_active)
 on conflict(id) do update set title=excluded.title,local_time=excluded.local_time,weekdays=excluded.weekdays,start_date=excluded.start_date,end_date=excluded.end_date,reminder_enabled=excluded.reminder_enabled,active=excluded.active,updated_at=now()
 where routines.user_id=auth.uid()
 returning id into rid;
 if rid is null then raise exception '루틴을 저장하지 못했습니다'; end if;
 return rid;
end $$;
revoke all on function public.save_routine(uuid,text,time,int[],date,date,boolean,boolean) from public,anon;
grant execute on function public.save_routine(uuid,text,time,int[],date,date,boolean,boolean) to authenticated;

do $$begin
 if to_regclass('public.cooling_off_items') is not null
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cooling_off_items') then
   alter publication supabase_realtime add table public.cooling_off_items;
 end if;
end $$;
commit;
