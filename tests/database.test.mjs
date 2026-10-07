import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { extractMemo } from "../lib/finance.mjs";
test("실제 PostgreSQL SQL: RLS, 원자 저장, 재시도, 상환 완료와 취소", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth;create table auth.users(id uuid primary key);create role authenticated;create role anon;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');`,
    );
    let schema = await readFile(
      new URL("../supabase/schema.sql", import.meta.url),
      "utf8",
    );
    schema = schema
      .replace("create extension if not exists pgcrypto;", "")
      .split("-- Add only these tables to Realtime.")[0];
    await db.exec(schema);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',false);`,
    );
    const req = "11111111-1111-4111-8111-111111111111";
    const fragments = JSON.stringify(
      extractMemo("21000원 우산 구매", "2026-10-07"),
    );
    const memo = () =>
      db.query("select save_memo($1,$2,$3) id", [
        req,
        "21000원 우산 구매",
        fragments,
      ]);
    const id = (await memo()).rows[0].id;
    assert.equal((await memo()).rows[0].id, id);
    assert.equal(
      (await db.query("select count(*)::int n from entries")).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query("select save_memo($1,$2,$3)", [req, "다른 메모", fragments]),
    );
    await assert.rejects(
      db.query("select save_memo($1,$2,$3)", [
        "22222222-2222-4222-8222-222222222222",
        "실패 메모",
        JSON.stringify([
          {
            id: "f0",
            status: "posted",
            text: "bad",
            kind: "expense",
            amount: -1,
            date: "2026-10-07",
          },
        ]),
      ]),
    );
    assert.equal(
      (await db.query("select count(*)::int n from memos")).rows[0].n,
      1,
    );
    const beforeVoid = (
      await db.query(
        "select ledger_totals('2026-10-01'::date,'2026-10-31'::date) t",
      )
    ).rows[0].t;
    const parsed =
      typeof beforeVoid === "string" ? JSON.parse(beforeVoid) : beforeVoid;
    assert.equal(Number(parsed.expense), 21000);
    assert.equal(Number(parsed.net), -21000);
    const ownedEntry = (await db.query("select id from entries")).rows[0].id;
    await db.exec(
      `select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',false)`,
    );
    assert.equal(
      (await db.query("select count(*)::int n from memos")).rows[0].n,
      0,
    );
    await assert.rejects(
      db.query("select void_entry(id) from (select $1::uuid id) t", [
        ownedEntry,
      ]),
    );
    await assert.rejects(
      db.query(
        "insert into entries(request_id,title,kind,amount,occurred_on,memo_id,fragment_id) values(gen_random_uuid(),'cross','expense',100,'2026-10-07',$1,'x')",
        [id],
      ),
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',false)`,
    );
    const entry = (await db.query("select id from entries")).rows[0].id;
    await db.query("select void_entry($1)", [entry]);
    assert.equal(
      (await db.query("select fragments from memos")).rows[0].fragments[0]
        .status,
      "voided",
    );
    const sid = "33333333-3333-4333-8333-333333333333";
    const schedule = () =>
      db.query(
        "select save_schedule($1,'카드값','credit',21000,'monthly',31,'2026-01-01',null) id",
        [sid],
      );
    await schedule();
    await schedule();
    assert.equal(
      (await db.query("select count(*)::int n from schedules")).rows[0].n,
      1,
    );
    const settle = (r) =>
      db.query("select settle_schedule($1,'2026-02-28','2026-02-28',$2) id", [
        sid,
        r,
      ]);
    const eid = (await settle("44444444-4444-4444-8444-444444444444")).rows[0]
      .id;
    assert.equal(
      (await settle("55555555-5555-4555-8555-555555555555")).rows[0].id,
      eid,
    );
    assert.equal(
      (await db.query("select kind from entries where id=$1", [eid])).rows[0]
        .kind,
      "repayment",
    );
    await assert.rejects(
      db.query("select settle_schedule($1,'2026-02-27','2026-02-27',$2)", [
        sid,
        "66666666-6666-4666-8666-666666666666",
      ]),
    );
    await db.query("select void_entry($1)", [eid]);
    assert.equal(
      (await db.query("select count(*)::int n from settlements")).rows[0].n,
      0,
    );
    await settle("77777777-7777-4777-8777-777777777777");
    const edited = JSON.stringify(
      extractMemo("오늘은 그냥 창밖을 봤어", "2026-10-07"),
    );
    const memoId = (await db.query("select id from memos")).rows[0].id;
    await db.query("select update_memo($1,$2,$3::jsonb)", [
      memoId,
      "오늘은 그냥 창밖을 봤어",
      edited,
    ]);
    assert.equal(
      (await db.query("select body from memos")).rows[0].body,
      "오늘은 그냥 창밖을 봤어",
    );
    await db.query("select delete_memo($1)", [memoId]);
    assert.equal(
      (await db.query("select count(*)::int n from memos")).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int n from entries")).rows[0].n,
      3,
    );
    const live = (
      await db.query(
        "select id from entries where voided_at is null limit 1",
      )
    ).rows[0].id;
    await db.query(
      "select revise_entry($1,'고친 기록','repayment',5000,'2026-02-28','account')",
      [live],
    );
    assert.equal(
      (await db.query("select amount::int n from entries where id=$1", [live]))
        .rows[0].n,
      5000,
    );
    await db.query("select end_schedule($1)", [sid]);
    assert.equal(
      (await db.query("select active from schedules where id=$1", [sid]))
        .rows[0].active,
      false,
    );
    await db.exec("reset role;set role anon;");
    await assert.rejects(db.query("select * from entries"));
    await assert.rejects(
      db.query("select save_memo($1,$2,$3)", [req, "x", "[]"]),
    );
  } finally {
    await db.close();
  }
});
