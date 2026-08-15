import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import {
  SAMPLE_QUESTIONS,
  assertReadonlySql,
  buildPipeline,
  executeReadonly,
  getDemoDatabase,
  requestModelPlan,
} from "./agent.js";

const wasmPath = fileURLToPath(new URL("../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url));

test("三个本地复杂场景都能生成只读 SQL 并返回结果", async () => {
  const database = await getDemoDatabase(initSqlJs, wasmPath);
  for (const question of SAMPLE_QUESTIONS) {
    const pipeline = await buildPipeline({ question });
    assertReadonlySql(pipeline.sql);
    const result = executeReadonly(database, pipeline.sql);
    assert.ok(result.rowCount > 0, `${pipeline.id} 应返回样例结果`);
  }
});

test("写操作和多语句在进入 SQLite 前被拦截", () => {
  assert.throws(() => assertReadonlySql("DELETE FROM customers"), /只允许/);
  assert.throws(() => assertReadonlySql("WITH x AS (SELECT 1) DELETE FROM customers"), /写入/);
  assert.throws(() => assertReadonlySql("SELECT 1; SELECT 2"), /一条 SQL/);
});

test("DeepSeek 请求关闭思考模式并要求有限 JSON 输出", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":"测试","plan":["读取数据"],"sql":"SELECT 1"}' } }],
      }),
    };
  };
  try {
    await requestModelPlan({
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey: "temporary-test-key",
      model: "deepseek-v4-flash",
      question: "测试",
      tables: [],
    });
    assert.deepEqual(requestBody.thinking, { type: "disabled" });
    assert.deepEqual(requestBody.response_format, { type: "json_object" });
    assert.equal(requestBody.max_tokens, 1200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
