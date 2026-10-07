import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("루틴 추가 마이그레이션·RLS·재시도·충돌·미룸·완료 시간", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth;create table auth.users(id uuid primary key);create role authenticated;create role anon;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');`,
    );
    // Existing base schema and data remain intact when the additive migration is applied twice.
    const base = (
      await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8")
    )
      .replace("create extension if not exists pgcrypto;", "")
      .split("-- Add only these tables to Realtime.")[0];
    await db.exec(base);
    let sql =
      (
        await readFile(
          new URL("../supabase/migrations/003_routines.sql", import.meta.url),
          "utf8",
        )
      ).split("-- Realtime publication")[0] + "commit;";
    await db.exec(sql);
    await db.exec(sql);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',false);`,
    );
    const sid = "33333333-3333-4333-8333-333333333333";
    await db.query(
      "select save_routine($1,'약 챙기기','09:00',array[1,2,3,4,5,6,7],'2020-01-01',null,true,true)",
      [sid],
    );
    const date = (
      await db.query("select (now() at time zone 'Asia/Seoul')::date::text d")
    ).rows[0].d;
    const req = "44444444-4444-4444-8444-444444444444";
    await db.query("select set_routine_status($1,$2,$3,$4,null,$5)", [
      req,
      sid,
      date,
      "snoozed",
      "absent",
    ]);
    await db.query("select set_routine_status($1,$2,$3,$4,null,$5)", [
      req,
      sid,
      date,
      "snoozed",
      "absent",
    ]);
    assert.equal(
      (await db.query("select count(*)::int n from routine_actions")).rows[0].n,
      1,
    );
    const old = (
      await db.query(
        "select updated_at::text u,snoozed_until from routine_logs",
      )
    ).rows[0];
    assert.ok(old.snoozed_until);
    await assert.rejects(
      db.query("select set_routine_status($1,$2,$3,$4,null,$5)", [
        "55555555-5555-4555-8555-555555555555",
        sid,
        date,
        "completed",
        "absent",
      ]),
    );
    await db.query("select set_routine_status($1,$2,$3,$4,null,$5)", [
      "66666666-6666-4666-8666-666666666666",
      sid,
      date,
      "completed",
      old.u,
    ]);
    // Client snooze time survives a delayed retry instead of resetting at receipt.
    const current = (
      await db.query("select updated_at::text u from routine_logs")
    ).rows[0].u;
    const until = new Date(Date.now() + 5 * 60000).toISOString();
    await db.query(
      "select set_routine_status(gen_random_uuid(),$1,$2,'snoozed',null,$3,$4)",
      [sid, date, current, until],
    );
    assert.equal(
      new Date(
        (await db.query("select snoozed_until from routine_logs")).rows[0]
          .snoozed_until,
      ).toISOString(),
      until,
    );
    const snoozedVersion = (
      await db.query("select updated_at::text u from routine_logs")
    ).rows[0].u;
    await db.query(
      "select set_routine_status(gen_random_uuid(),$1,$2,'completed',null,$3)",
      [sid, date, snoozedVersion],
    );
    const log = (await db.query("select * from routine_logs")).rows[0];
    assert.equal(log.status, "completed");
    assert.ok(log.completed_at);
    assert.equal(log.snoozed_until, null);
    await assert.rejects(
      db.query(
        "select set_routine_status(gen_random_uuid(),$1,'2099-01-01','completed')",
        [sid],
      ),
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',false);`,
    );
    assert.equal(
      (await db.query("select count(*)::int n from routines")).rows[0].n,
      0,
    );
    await assert.rejects(
      db.query("select set_routine_status(gen_random_uuid(),$1,$2,$3)", [
        sid,
        date,
        "skipped",
      ]),
    );
    await assert.rejects(
      db.query(
        "select save_routine($1,'다른 사용자','09:00',array[1],'2020-01-01',null,true,true)",
        [sid],
      ),
    );
    await db.exec("reset role;set role anon;");
    await assert.rejects(db.query("select * from routines"));
  } finally {
    await db.close();
  }
});
