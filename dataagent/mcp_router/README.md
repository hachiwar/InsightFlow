# mcp_router

MCP 路由执行模块。`MCPRouter` 使用官方 MCP Python SDK 暴露 `execute_readonly_sql` 工具；即使采用进程内 transport，工具发现、输入 Schema 校验和调用仍经过 MCP 协议层，再路由到受治理的数据库执行器。

## 目录结构

```text
mcp_router/
├── __init__.py
├── objects.py          # MCP执行请求和执行结果
├── sqlite_executor.py  # SQLite 双层只读治理、超时、结果上限和审计
└── router.py           # MCP Server、Client、工具发现和执行器路由
```

## 执行请求格式

```json
{
  "database": "trade_db",
  "sql": "SELECT ..."
}
```

SQLite 执行器同时使用静态 SQL 检查、表白名单、只读 URI、`PRAGMA query_only` 和运行时 authorizer；模型 SQL 不会绕过 MCP 工具直接访问数据库。
