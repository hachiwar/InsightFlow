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
