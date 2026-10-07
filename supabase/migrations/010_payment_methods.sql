-- Card, cash, phone, and easy-pay can be chosen when a wish becomes an expense.
begin;

do $$
declare c name;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.entries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_method%'
  loop
    execute format('alter table public.entries drop constraint %I', c);
  end loop;
  alter table public.entries
    add constraint entries_payment_method_check
    check (payment_method in ('cash', 'debit', 'credit', 'account', 'phone', 'easy'));
end $$;

commit;
