# DataAgent Text2SQL Demo

本项目演示从自然语言 Query 到 SQL 生成与执行的端到端流程。

## 核心模块

```text
schema_indexing/    # Schema 索引构建，离线阶段
schema_retrieval/   # Schema 检索与 SchemaGraph 构建
cot_planning/       # CoT 四元组规划
sql_generation/     # SQL 生成与有限修复
mcp_router/         # SQL 治理、执行器路由与审计
dataagent_pipeline/ # HTTP 服务与端到端流程编排
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
Schema 混合检索 + RRF + Rerank
  ↓
SchemaGraph
  ↓
CoT 四元组规划
  ↓
SQL 生成
  ↓
SQL 只读治理
  ↓
执行器路由与只读数据库执行
  ↓
执行失败时最多 2 次错误反馈修复
  ↓
结果一致性校验与问题导向总结
```

`POST /query` 返回自然语言答案、校验结果、分步执行轨迹和 SQL 审计信息。只有所有查询步骤均执行成功且通过一致性校验时，整体请求才标记为成功。
