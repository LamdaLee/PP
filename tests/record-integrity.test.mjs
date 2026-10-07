import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { extractMemo } from "../lib/finance.mjs";

const owner = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("메모·보류 원자 저장과 구매 전환 재시도, 취소, 실패 롤백", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create table auth.users(id uuid primary key);
      create role authenticated; create role anon;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      insert into auth.users values('${owner}'),('${other}');`);
    const schema = (await read("supabase/schema.sql")).replace("create extension if not exists pgcrypto;", "").split("-- Add only these tables to Realtime.")[0];
    await db.exec(schema);
    await db.exec(await read("supabase/migrations/005_cooling_off.sql"));
    await db.exec(await read("supabase/migrations/009_daily_and_open_amount.sql"));
    const migration = await read("supabase/migrations/20261007141746_record_integrity.sql");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);

    const request = crypto.randomUUID();
    const body = "21000원 우산 사고 싶다";
    const save = () => db.query("select save_memo_with_cooling($1,$2,$3::jsonb) id", [request, body, JSON.stringify(extractMemo(body, "2026-10-07"))]);
    const memoId = (await save()).rows[0].id;
    assert.equal((await save()).rows[0].id, memoId);
    assert.equal((await db.query("select count(*)::int n from memos")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from cooling_off_items")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from entries")).rows[0].n, 0);
    const itemId = (await db.query("select id from cooling_off_items")).rows[0].id;
    const purchase = (requestId, method = "credit") => db.query("select purchase_cooling_item($1,$2,'2026-10-07',$3) id", [itemId, requestId, method]);
    await assert.rejects(purchase(crypto.randomUUID(), "invalid"));
    assert.equal((await db.query("select status from cooling_off_items")).rows[0].status, "cooling");
    assert.equal((await db.query("select count(*)::int n from entries")).rows[0].n, 0);

    // Force the second write to fail: the first write must also roll back.
    await db.exec("reset role; create function reject_purchase() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$; create trigger reject_purchase before update on cooling_off_items for each row execute function reject_purchase(); set role authenticated;");
    await assert.rejects(purchase(crypto.randomUUID()));
    assert.equal((await db.query("select count(*)::int n from entries")).rows[0].n, 0);
    assert.equal((await db.query("select status from cooling_off_items")).rows[0].status, "cooling");
    await db.exec("reset role; drop trigger reject_purchase on cooling_off_items; set role authenticated;");

    const purchaseRequest = crypto.randomUUID();
    const entryId = (await purchase(purchaseRequest)).rows[0].id;
    assert.equal((await purchase(purchaseRequest)).rows[0].id, entryId);
    assert.equal((await purchase(crypto.randomUUID())).rows[0].id, entryId);
    assert.equal((await db.query("select count(*)::int n from entries")).rows[0].n, 1);
    const item = (await db.query("select status,entry_id from cooling_off_items")).rows[0];
    assert.equal(item.status, "purchased");
    assert.equal(item.entry_id, entryId);
    assert.equal(Number((await db.query("select ledger_totals('2026-10-01','2026-10-31') t")).rows[0].t.expense), 21000);

    // Editing and cancelling the actual transaction affect the real totals.
    await db.query("select revise_entry($1,'우산','expense',19000,'2026-10-07','credit')", [entryId]);
    assert.equal(Number((await db.query("select ledger_totals('2026-10-01','2026-10-31') t")).rows[0].t.expense), 19000);
    await db.query("select void_entry($1)", [entryId]);
    assert.equal(Number((await db.query("select ledger_totals('2026-10-01','2026-10-31') t")).rows[0].t.expense), 0);
    await assert.rejects(purchase(crypto.randomUUID()));
    assert.equal((await db.query("select count(*)::int n from entries")).rows[0].n, 1);

    const openId = crypto.randomUUID();
    await db.query("insert into cooling_off_items(id,title,expires_at) values($1,'금액 없는 소원',now())", [openId]);
    await assert.rejects(db.query("select purchase_cooling_item($1,$2,'2026-10-07','cash')", [openId, crypto.randomUUID()]));

    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    await assert.rejects(purchase(crypto.randomUUID()));
    assert.equal((await db.query("select count(*)::int n from cooling_off_items")).rows[0].n, 0);
    await assert.rejects(db.query("insert into cooling_off_items(title,expires_at,entry_id) values('cross',now(),$1)", [entryId]));
    await db.exec("reset role; set role anon;");
    await assert.rejects(purchase(crypto.randomUUID()));
    await assert.rejects(save());

    // A failed wish insert must leave neither a source nor a confirmed expense.
    await db.exec(`reset role; create function reject_wish() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$;
      create trigger reject_wish before insert on cooling_off_items for each row execute function reject_wish();
      set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    const mixed = "5000원 커피 구매\n우산 사고 싶다";
    await assert.rejects(db.query("select save_memo_with_cooling($1,$2,$3::jsonb)", [crypto.randomUUID(), mixed, JSON.stringify(extractMemo(mixed, "2026-10-07"))]));
    assert.equal((await db.query("select count(*)::int n from memos")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from entries")).rows[0].n, 1);
  } finally {
    await db.close();
  }
});
