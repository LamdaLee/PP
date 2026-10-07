-- Apply after migrations 003 through 010. Additive; never rerun schema.sql.
begin;

alter table public.cooling_off_items
  add column if not exists entry_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.cooling_off_items'::regclass and conname = 'cooling_entry_owner') then
    alter table public.cooling_off_items add constraint cooling_entry_owner
      foreign key (user_id, entry_id) references public.entries(user_id, id);
  end if;
end $$;

-- Save the source, any confirmed ledger rows, and wishes together.
-- The deterministic item ID also repairs a retried save without adding a wish twice.
create or replace function public.save_memo_with_cooling(p_request_id uuid, p_body text, p_fragments jsonb)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare mid uuid; stored jsonb; f jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  mid := public.save_memo(p_request_id, p_body, p_fragments);
  select fragments into stored from public.memos where id = mid and user_id = auth.uid() for update;
  for f in select value from jsonb_array_elements(stored) loop
    if f->>'intent' = 'buy' and f->>'status' is distinct from 'posted' then
      insert into public.cooling_off_items(id, title, amount, reason, emotion, cool_down_hours, expires_at)
      values (
        md5(mid::text || ':' || (f->>'id'))::uuid,
        left(coalesce(nullif(f->>'item', ''), f->>'text'), 200),
        (f->>'amount')::bigint,
        left(f->>'text', 1000), '충동', 24, now() + interval '24 hours'
      ) on conflict (id) do nothing;
    end if;
  end loop;
  return mid;
end $$;

-- Lock the wish so retries (including different request IDs) share one ledger row.
-- A failed ledger insert or status update rolls the entire call back.
create or replace function public.purchase_cooling_item(p_id uuid, p_request_id uuid, p_date date, p_method text)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare item public.cooling_off_items; eid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if p_request_id is null or p_date is null then raise exception '구매 기록을 확인해 주세요'; end if;
  select * into item from public.cooling_off_items where id = p_id and user_id = auth.uid() for update;
  if item.id is null then raise exception '보류 항목이 없습니다'; end if;
  if item.entry_id is not null then
    if exists (select 1 from public.entries where id = item.entry_id and user_id = auth.uid() and voided_at is null) then
      return item.entry_id;
    end if;
    raise exception '이미 취소한 구매입니다. 새 기록을 작성해 주세요';
  end if;
  if item.status <> 'cooling' then raise exception '이미 처리한 보류 항목입니다'; end if;
  if item.amount is null then raise exception '금액을 먼저 적어 주세요'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_request_id::text, 0));
  -- An unrelated transaction must not be reused for this purchase.
  if exists (select 1 from public.entries where user_id = auth.uid() and request_id = p_request_id) then
    raise exception '요청 ID가 다른 거래에 사용되었습니다';
  end if;
  eid := public.save_entry(p_request_id, item.title, 'expense', item.amount, p_date, p_method);
  update public.cooling_off_items set status = 'purchased', entry_id = eid where id = item.id and user_id = auth.uid();
  return eid;
end $$;

revoke all on function public.save_memo_with_cooling(uuid, text, jsonb), public.purchase_cooling_item(uuid, uuid, date, text) from public, anon;
grant execute on function public.save_memo_with_cooling(uuid, text, jsonb), public.purchase_cooling_item(uuid, uuid, date, text) to authenticated;
commit;
