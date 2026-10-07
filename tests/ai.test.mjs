import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMemo, mergeCandidates } from "../lib/ai.mjs";
import { extractMemo } from "../lib/finance.mjs";
test("AI 결과는 원문·날짜·확정 금액을 바꾸거나 자동 지출을 만들지 않는다", () => {
  const fs = extractMemo(
    "21000원 우산 구매\n우산 샀어 3만원 같아",
    "2026-10-07",
  );
  const result = mergeCandidates(fs, [
    { id: "f0", categories: ["emotion"], amount: 999999, kind: "income" },
    { id: "f1", categories: ["money"], amount: 30000, kind: "expense" },
  ]);
  assert.equal(result[0].amount, 21000);
  assert.equal(result[0].kind, "expense");
  assert.equal(result[0].date, "2026-10-07");
  assert.equal(result[1].status, "pending");
  assert.equal(result[1].text, fs[1].text);
  assert.throws(() =>
    mergeCandidates(fs, [
      { id: "invented", categories: [], amount: null, kind: null },
    ]),
  );
  assert.throws(() =>
    mergeCandidates(fs, [
      { id: "f1", categories: ["money"], amount: -1, kind: "expense" },
    ]),
  );
});
test("키 없음은 외부 호출 없이 기본 분류", async () => {
  const r = await classifyMemo("생각", "2026-10-07", {
    apiKey: "",
    fetcher: () => {
      throw Error("must not call");
    },
  });
  assert.equal(r.aiMode, "off");
});
test("Responses 요청과 검증, 실패시 기본 분류 보존", async () => {
  let request;
  const r = await classifyMemo("회의 자료 좀 정리", "2026-10-07", {
    apiKey: "test-only",
    fetcher: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      request = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    candidates: [
                      {
                        id: "f0",
                        categories: ["work"],
                        amount: null,
                        kind: null,
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
      };
    },
  });
  assert.equal(r.aiMode, "applied");
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
  assert.deepEqual(r.fragments[0].categories, ["work"]);
  for (const fetcher of [
    async () => ({ ok: false }),
    async () => {
      throw Error("network");
    },
    async () => ({ ok: true, json: async () => ({ status: "incomplete" }) }),
    async () => ({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      }),
    }),
  ]) {
    const fallback = await classifyMemo("21000원 우산 구매", "2026-10-07", {
      apiKey: "test-only",
      fetcher,
    });
    assert.equal(fallback.aiMode, "fallback");
    assert.equal(fallback.fragments[0].status, "posted");
  }
});
