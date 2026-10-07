-- Edit and delete memos. Ledger rows stay; they only lose the memo link.
begin;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'memos' and policyname = 'own_delete'
  ) then
    create policy own_delete on public.memos
      for delete to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

grant delete on public.memos to authenticated;

create or replace function public.update_memo(p_id uuid, p_body text, p_fragments jsonb) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if p_body is null or length(btrim(p_body)) < 1 or length(p_body) > 10000 then
    raise exception '메모를 1~10000자로 입력해 주세요';
  end if;
  if jsonb_typeof(p_fragments) <> 'array' or jsonb_array_length(p_fragments) > 1000 then
    raise exception '분류 형식 오류';
  end if;
  update memos set body = p_body, fragments = p_fragments
  where id = p_id and user_id = auth.uid();
  get diagnostics n = row_count;
  if n = 0 then raise exception '메모가 없습니다'; end if;
  return p_id;
end $$;

create or replace function public.delete_memo(p_id uuid) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  update entries set memo_id = null, fragment_id = null
  where memo_id = p_id and user_id = auth.uid();
  delete from memos where id = p_id and user_id = auth.uid();
  get diagnostics n = row_count;
  if n = 0 then raise exception '메모가 없습니다'; end if;
end $$;

revoke all on function public.update_memo(uuid, text, jsonb), public.delete_memo(uuid) from public, anon;
grant execute on function public.update_memo(uuid, text, jsonb), public.delete_memo(uuid) to authenticated;

commit;
