# DataAgent Text-to-SQL 服务

DataAgent 把自然语言数据问题转换为受治理的只读 SQL。主链路使用字段级 BM25 + Milvus 向量召回、RRF、Rerank、SchemaGraph、规划与 SQL 生成，并通过官方 MCP Python SDK 调用 SQLite 只读工具。

## 主链路

```text
Query → 关键词抽取 → BM25 / Milvus 双路召回 → RRF → Rerank
→ 主外键补齐与 SchemaGraph → 四元组规划 → 局部 Schema SQL 生成
→ SQL 静态治理 → MCP 工具调用 → SQLite authorizer + 只读连接
→ 最多 2 次执行错误修复 → 执行完整性校验 → 问题导向总结
```

`verification.scope=execution_integrity` 只证明 SQL 策略、执行状态、行列结构和数值有效性通过检查；业务语义正确性由带标准 SQL/结果集的离线评测判定，二者不混用。

## 运行模式

- 本地演示：显式设置 `DATAAGENT_INITIALIZE_DEMO=true` 与 `DATAAGENT_ALLOW_MOCK=true`，创建内置 SQLite 数据并仅支持文档中的交易笔数/利率问题。
- 完整模型链路：设置 `DATAAGENT_ALLOW_MOCK=false`，并配置 `DASHSCOPE_API_KEY` 以及 `DASHSCOPE_WORKSPACE_ID` 或 `DASHSCOPE_RERANK_URL`。关键词、Embedding、Rerank、规划和 SQL 生成均调用真实服务，缺少配置时启动失败。
- 已有数据库：设置 `DATAAGENT_INITIALIZE_DEMO=false`、`DATAAGENT_DB_PATH`、`DATAAGENT_DATABASE_NAME`、`DATAAGENT_ALLOWED_TABLES`；服务不会创建、覆盖或删除数据库。可用 `DATAAGENT_BUSINESS_META_PATH` 传入字段描述、别名和业务语义 JSON。

Milvus 默认使用 `DATAAGENT_DB_PATH` 同目录下的 `schema_index.db`（Milvus Lite 精确向量搜索）；设置 `DATAAGENT_MILVUS_URI` 与可选 `DATAAGENT_MILVUS_TOKEN` 后可连接远程 Milvus 并创建 `AUTOINDEX`。字段和表关系 Collection 都会构建、写入并在查询链路中读取。

## 本地演示

```powershell
python -m pip install -r requirements-runtime.txt
$env:DATAAGENT_INITIALIZE_DEMO = "true"
$env:DATAAGENT_ALLOW_MOCK = "true"
python -m dataagent_pipeline.http_server
```

接口：

```text
GET  /health
POST /query  {"query":"查询总交易笔数大于 50000 的用户利率"}
```

设置 `DATAAGENT_API_KEY` 后，`POST /query` 必须携带 `X-Internal-API-Key`。`GET /health` 会实际检查数据库、Milvus Collection、MCP 工具发现和只读查询，而不是返回静态状态。

## 主要目录

```text
schema_indexing/    # SQLite Schema 扫描、Embedding、Milvus 字段和关系索引
schema_retrieval/   # BM25 / Milvus 召回、RRF、Rerank、SchemaGraph
cot_planning/       # 四元组查询规划
sql_generation/    # 局部 Schema SQL 生成与有限修复
mcp_router/         # MCP 工具、SQL 治理、SQLite 只读执行和审计
dataagent_pipeline/ # HTTP 服务与端到端编排
tests/              # 协议、向量索引、安全和部署边界测试
```

## 测试

```bash
python -m unittest discover -s tests -v
```
