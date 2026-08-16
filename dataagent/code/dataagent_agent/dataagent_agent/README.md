# DataAgent Text2SQL Demo

本项目演示从自然语言 Query 到 SQL 生成与执行的端到端流程。

## 核心模块

```text
schema_indexing/      # Schema索引构建，离线阶段
schema_retrieval/     # Schema检索与SchemaGraph构建
cot_planning/         # CoT四元组规划
sql_generation/       # SQL生成
mcp_router/           # MCP路由执行
dataagent_pipeline/     # 端到端流程编排
```

## 端到端运行

```bash
python -m dataagent_pipeline.end_to_end_demo
```

当前 Demo 会自动创建 SQLite 测试库：

```text
runtime_data/trade_demo.db
```

测试 Query：

```text
查询总交易笔数大于50000的利率是多少
```

## 当前链路

```text
用户Query
  ↓
关键词抽取
  ↓
Schema混合检索 + RRF + Rerank
  ↓
SchemaGraph
  ↓
CoT四元组规划
  ↓
SQL生成
  ↓
MCP路由执行
  ↓
查询结果
```

暂不包含结果校验与回调修正。
