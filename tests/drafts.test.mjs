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
