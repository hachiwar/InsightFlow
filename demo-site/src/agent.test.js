import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import {
  SAMPLE_QUESTIONS,
  SCHEMA,
  assertReadonlySql,
  buildPipeline,
  executeReadonly,
  getDemoDatabase,
  requestModelExplanation,
  requestModelPlan,
  requestModelRepair,
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

test("慢思考模型请求关闭思考模式并要求有限 JSON 输出", async () => {
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
    for (const endpoint of ["https://api.deepseek.com/chat/completions", "https://open.bigmodel.cn/api/paas/v4/chat/completions"]) {
      await requestModelPlan({ endpoint, apiKey: "temporary-test-key", model: "test-model", question: "测试", tables: [SCHEMA.find((table) => table.name === "orders")] });
      assert.deepEqual(requestBody.thinking, { type: "disabled" });
      assert.deepEqual(requestBody.response_format, { type: "json_object" });
      assert.equal(requestBody.max_tokens, 1200);
      assert.match(requestBody.messages[0].content, /完整时间序列/);
      assert.match(requestBody.messages[1].content, /completed（成功）/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("模型解释接收已执行 SQL 和真实查询结果", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"explanation":"华北利润为负，应检查成本结构。"}' } }] }),
    };
  };
  try {
    const explanation = await requestModelExplanation({
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey: "temporary-test-key",
      model: "deepseek-v4-flash",
      question: "哪些地区亏损？",
      sql: "SELECT region, profit FROM summary",
      result: { columns: ["region", "profit"], rows: [{ region: "华北", profit: -212000 }], rowCount: 1, truncated: false },
    });
    assert.equal(explanation, "华北利润为负，应检查成本结构。");
    assert.match(requestBody.messages[1].content, /华北/);
    assert.match(requestBody.messages[1].content, /-212000/);
    assert.match(requestBody.messages[0].content, /不得把当前值当作变化额/);
    assert.equal(requestBody.max_tokens, 700);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SQL 纠错请求包含失败 SQL、SQLite 错误和 Schema", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"title":"已修复","plan":["修正字段"],"sql":"SELECT revenue FROM orders"}' } }] }),
    };
  };
  try {
    const repaired = await requestModelRepair({
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey: "temporary-test-key",
      model: "deepseek-v4-flash",
      question: "查询收入",
      tables: [{ name: "orders", label: "订单", columns: [["revenue", "NUMERIC", "收入"]] }],
      sql: "SELECT product_cost FROM monthly",
      error: "no such column: product_cost",
    });
    assert.equal(repaired.sql, "SELECT revenue FROM orders");
    assert.match(requestBody.messages[1].content, /no such column: product_cost/);
    assert.match(requestBody.messages[1].content, /TABLE orders/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
