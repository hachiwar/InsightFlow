# askdata_pipeline

端到端 Text2SQL Demo。

## 目录结构

```text
askdata_pipeline/
├── __init__.py
├── demo_data.py             # 测试数据库创建与业务Schema元数据
├── create_demo_db.py        # 单独创建SQLite测试库
├── sql_execution_demo.py    # 最小MCP SQL执行Demo
├── local_clients.py         # 本地Mock关键词抽取和Embedding
├── objects.py               # Pipeline数据结构
├── text2sql_pipeline.py     # 端到端流程编排
└── end_to_end_demo.py       # 完整Text2SQL Demo
```

## 1. 创建测试数据库

```bash
python -m askdata_pipeline.create_demo_db
```

会生成：

```text
runtime_data/trade_demo.db
```

测试数据 SQL 在：

```text
sql/create_trade_demo.sql
```

## 2. 只测试SQL执行环境

```bash
python -m askdata_pipeline.sql_execution_demo
```

这个 Demo 不走大模型，只验证 MCP 路由和 SQLite 执行。

## 3. 运行端到端流程

```bash
python -m askdata_pipeline.end_to_end_demo
```

## 4. 启动 EchoMind 集成接口

```bash
python -m askdata_pipeline.http_server
```

接口仅暴露只读查询：

```text
GET  /health
POST /query  {"query":"查询总交易笔数大于50000的利率是多少"}
```
