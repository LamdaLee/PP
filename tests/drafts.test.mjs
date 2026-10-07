import { test } from "node:test";
import assert from "node:assert/strict";
import { readMemoDraft, writeMemoDraft } from "../lib/drafts.mjs";
test("응답을 못 받은 메모도 새로고침 후 같은 저장 요청 ID를 복구한다", () => {
  const values = new Map();
  const storage = { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
  const requestId = "11111111-1111-4111-8111-111111111111";
  assert.equal(writeMemoDraft(storage, "owner", "21000원 우산 구매", requestId), true);
  assert.deepEqual(readMemoDraft(storage, "owner"), { text: "21000원 우산 구매", requestId });
  assert.deepEqual(readMemoDraft(storage, "other"), { text: "", requestId: "" });
  writeMemoDraft(storage, "owner", "");
  assert.deepEqual(readMemoDraft(storage, "owner"), { text: "", requestId: "" });
});
test("손상되거나 사용할 수 없는 로컬 저장소가 앱을 중단시키지 않는다", () => {
  const corrupt = { getItem: () => "not json" };
  assert.deepEqual(readMemoDraft(corrupt, "owner"), { text: "", requestId: "" });
  const blocked = { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("full"); } };
  assert.deepEqual(readMemoDraft(blocked, "owner"), { text: "", requestId: "" });
  assert.equal(writeMemoDraft(blocked, "owner", "메모"), false);
});

import { readEntryDraft, writeEntryDraft, readLegacyDrafts, removeLegacyDraft } from "../lib/drafts.mjs";
import { accountMatches } from "../lib/account-guard.mjs";
test("직접 거래 응답 유실 후 같은 내용과 요청 ID를 사용자별로 복구한다", () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k) || null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  const draft = { fields: { title: "우산", kind: "expense", amount: "21000", date: "2026-10-08", method: "cash" }, requestId: "11111111-1111-4111-8111-111111111111" };
  assert.equal(writeEntryDraft(storage, "A", draft), true);
  assert.deepEqual(readEntryDraft(storage, "A"), draft);
  assert.equal(readEntryDraft(storage, "B"), null);
  assert.equal(writeEntryDraft(storage, "A", null), true);
  assert.equal(readEntryDraft(storage, "A"), null);
});
test("계정 전환과 같은 계정 재로그인 뒤 이전 응답을 거부한다", () => {
  const original = { userId: "A", generation: 1 };
  assert.equal(accountMatches(original, { userId: "B", generation: 2 }), false);
  assert.equal(accountMatches(original, { userId: "A", generation: 3 }), false);
  assert.equal(accountMatches(original, { userId: "A", generation: 1 }), true);
});
test("이전 기록 읽기는 자동 이동하지 않고 손상·차단·동시 변경을 보존한다", () => {
  const values = new Map([["pp_draft_text", "이전 초안"], ["pp_cooling_off_items", "[]"]]);
  const storage = { getItem: k => values.get(k) || null, removeItem: k => values.delete(k) };
  assert.deepEqual(readLegacyDrafts(storage), { text: "이전 초안", items: [], invalid: false });
  assert.equal(values.get("pp_draft_text"), "이전 초안");
  assert.equal(removeLegacyDraft(storage, "pp_draft_text", "다른 내용"), false);
  assert.equal(values.get("pp_draft_text"), "이전 초안");
  const blocked = { getItem: () => { throw Error("blocked"); } };
  assert.equal(readLegacyDrafts(blocked).invalid, true);
  assert.equal(readEntryDraft(blocked, "A"), null);
  assert.equal(writeEntryDraft(blocked, "A", {}), false);
  assert.equal(removeLegacyDraft(blocked, "pp_draft_text", ""), false);
  values.set("pp_cooling_off_items", "{}");
  assert.equal(readLegacyDrafts(storage).invalid, true);
});
