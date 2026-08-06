# InsightFlow 企业知识与数据问答 Agent

InsightFlow 面向企业私域数据，将 EchoMind 的统一 API、会话管理和 Agent 编排能力与 AskData 的结构化数据查询能力组合起来，根据用户意图在知识库问答、业务服务和数据库分析之间选择处理链路。

## 项目目标

- 使用统一对话入口处理企业知识问答、客服请求和数据分析问题。
- 对文档类问题使用检索增强生成（RAG）。
- 对结构化数据问题使用 Schema 检索、查询规划和 Text2SQL。
- 保留意图、Agent、SQL、执行结果和耗时等中间信息，支持问题定位和评测。
- 数据库查询默认使用只读连接，并由独立服务隔离模型与数据库凭据。

## 总体架构

```text
用户
  ↓
EchoMind /chat
  ↓
记忆上下文 + 意图识别
  ├─ 知识与普通咨询 → GeneralAgent / KnowledgeBase
  ├─ 技术问题       → TechnicalAgent
  ├─ 账单与账户问题 → BillingAgent
  └─ 数据分析问题   → DataAgent
                         ↓
                    AskData API
                         ↓
        Schema 检索 → SchemaGraph → CoT 规划
                         ↓
                    SQL 生成与只读执行
```

详细设计见[架构设计](docs/architecture.md)，实现范围见[实现状态](docs/status.md)。

## 目录结构

```text
InsightFlow/
├── askdata/             # Python Text2SQL 核心链路
├── echomind/            # Java 业务 Agent 与统一 API
└── docs/                # 融合架构与实现状态
```

## 本地运行

### 启动 AskData

在 `askdata/code/askdata_agent/askdata_agent` 目录运行：

```powershell
$env:PYTHONIOENCODING = "utf-8"
python -m askdata_pipeline.http_server
```

默认监听 `http://127.0.0.1:8090`，提供：

- `GET /health`：健康检查；
- `POST /query`：执行自然语言数据查询。

### 启动 EchoMind

在 `echomind/EchoMindJava/EchoMindJava` 目录配置模型和 Redis，然后运行 Spring Boot 应用。EchoMind 默认通过 `http://localhost:8090` 调用 AskData。

可用环境变量：

| 变量 | 默认值 | 说明 |
|---|---:|---|
| `ASKDATA_BASE_URL` | `http://localhost:8090` | AskData 服务地址 |
| `ASKDATA_TIMEOUT_MS` | `30000` | 数据查询超时时间，单位为 ms |

### 调用统一入口

```http
POST /chat
Content-Type: application/json

{
  "message": "查询总交易笔数大于 50000 的用户利率",
  "user_id": "u1001"
}
```

## 安全边界

- AskData 当前只注册 SQLite 演示执行器。
- 不允许模型直接持有数据库凭据或绕过执行服务连接数据库。
- 接入生产数据库前，必须补充数据源白名单、表字段权限、查询超时、结果行数限制和 SQL 审计。
- 当前代码尚未实现结果校验和模块级回溯，不应宣称已经形成完整 Reflection 闭环。

## 当前边界

该项目当前不包含：

- 数据可视化前端；
- 数据库写入操作；
- 标准远程 MCP Server；
- 多生产数据库接入；
- 未经验证的准确率或性能指标。
