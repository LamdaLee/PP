-- Amount-less wishes can wait. Ledger rows and schedules can be corrected.
begin;

do $$
declare c name;
begin
  if to_regclass('public.cooling_off_items') is not null then
    for c in
      select conname from pg_constraint
      where conrelid = 'public.cooling_off_items'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%amount%'
    loop
      execute format('alter table public.cooling_off_items drop constraint %I', c);
    end loop;
    alter table public.cooling_off_items alter column amount drop not null;
    alter table public.cooling_off_items
      add constraint cooling_off_items_amount_check
      check (amount is null or (amount > 0 and amount <= 1000000000000));
  end if;
end $$;

create or replace function public.revise_entry(p_id uuid, p_title text, p_kind text, p_amount bigint, p_date date, p_method text) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if p_title is null or length(btrim(p_title)) < 1 or length(p_title) > 500 then
    raise exception '이름을 확인해 주세요';
  end if;
  update entries set title = btrim(p_title), kind = p_kind, amount = p_amount, occurred_on = p_date, payment_method = p_method
  where id = p_id and user_id = auth.uid() and voided_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception '거래가 없습니다'; end if;
  return p_id;
end $$;

create or replace function public.revise_schedule(p_id uuid, p_title text, p_kind text, p_amount bigint, p_recurrence text, p_day int, p_start date, p_end date) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  update schedules
  set title = p_title, kind = p_kind, amount = p_amount, recurrence = p_recurrence,
      day_of_month = p_day, start_date = p_start, end_date = p_end
  where id = p_id and user_id = auth.uid() and active;
  get diagnostics n = row_count;
  if n = 0 then raise exception '예정 항목이 없습니다'; end if;
  return p_id;
end $$;

create or replace function public.end_schedule(p_id uuid) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  update schedules set active = false where id = p_id and user_id = auth.uid() and active;
  get diagnostics n = row_count;
  if n = 0 then raise exception '예정 항목이 없습니다'; end if;
end $$;

revoke all on function public.revise_entry(uuid, text, text, bigint, date, text), public.revise_schedule(uuid, text, text, bigint, text, int, date, date), public.end_schedule(uuid) from public, anon;
grant execute on function public.revise_entry(uuid, text, text, bigint, date, text), public.revise_schedule(uuid, text, text, bigint, text, int, date, date), public.end_schedule(uuid) to authenticated;

commit;
