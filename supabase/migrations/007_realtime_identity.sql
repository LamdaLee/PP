-- ADDITIVE. Let user_id filters see insert/update payloads. Never rerun schema.sql.
begin;
do $$declare t text; begin
 foreach t in array array['memos','entries','schedules','settlements','routines','routine_logs','cooling_off_items'] loop
  if to_regclass('public.' || t) is not null then
    execute format('alter table public.%I replica identity full', t);
  end if;
 end loop;
end $$;
commit;
