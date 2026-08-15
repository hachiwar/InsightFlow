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

详细设计见[架构设计](docs/architecture.md)，实现范围见[实现状态](docs/status.md)。首次部署前，请阅读[国内服务器上线指南](docs/InsightFlow国内服务器上线指南.md)。

## 在线范例站

仓库包含可发布到 GitHub Pages 的纯前端范例站。它在浏览器内运行 SQLite 样例数据库，并逐步展示关键词识别、Schema 召回、查询规划、SQL 生成、只读检查、执行结果和结果解释。

范例站提供以下两种模式：

- 本地演示模式：不需要 API Key，支持 3 个经过测试的复杂多表场景；
- 自定义模型模式：内置 DeepSeek、通义千问和智谱 GLM 预设，也可填写任意 OpenAI 兼容 Chat Completions 端点。模型先根据问题和 Schema 生成 SQLite SQL；执行错误时根据 SQLite 反馈自动纠错一次；执行成功后再根据实际结果生成业务解释，解释请求失败时回退到本地总结。

上线步骤见 [GitHub Pages 范例站上线指南](docs/InsightFlow-GitHub-Pages范例站上线指南.md)。在本地预览：

```bash
cd demo-site
npm ci
npm run dev
```

GitHub Pages 不能保管服务端密钥。范例站不会持久化 API Key，但浏览器会将 Key、业务问题、相关 Schema、SQL 和查询结果直接发送到用户填写的模型端点。只应使用临时、限额 Key，不得输入生产长期密钥或提交敏感数据。

## 目录结构

```text
InsightFlow/
├── askdata/             # Python Text2SQL 核心链路
├── echomind/            # Java 业务 Agent 与统一 API
├── demo-site/           # GitHub Pages 浏览器 Text2SQL 范例站
├── deploy/              # Caddy 反向代理配置
├── scripts/             # 部署冒烟测试
├── docs/                # 融合架构、实现状态与上线指南
└── compose.yaml         # 完整单机部署入口
```

## Docker Compose 快速启动

详细步骤和国内云服务器注意事项见[国内服务器上线指南](docs/InsightFlow国内服务器上线指南.md)。本地首次启动：

```bash
cp .env.example .env
# 编辑 .env，替换 3 个密码并填写模型 API Key
docker compose config --quiet
docker compose up -d --build
python3 scripts/smoke_test.py --base-url http://127.0.0.1 --api-key '<ECHOMIND_API_KEY>'
```

只有 Caddy 向主机映射 `80` 和 `443` 端口。Redis、AskData 和 EchoMind 仅通过 Compose 内部网络通信。

## 本地运行

### 启动 AskData

在 `askdata/code/askdata_agent/askdata_agent` 目录运行：

```powershell
$env:PYTHONIOENCODING = "utf-8"
$env:ASKDATA_ALLOW_MOCK = "true" # 仅用于文档演示查询
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
| `ASKDATA_API_KEY` | 空 | EchoMind 访问 AskData 的内部密钥 |
| `ECHOMIND_AUTH_ENABLED` | `false` | 是否开启公开 API 鉴权 |
| `ECHOMIND_API_KEY` | 空 | 公开 API 的 `X-API-Key` 密钥 |

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
- SQLite 以只读模式执行，单次查询设置超时并最多返回 100 行。
- 容器部署默认禁用 AskData Mock，未配置有效模型时数据查询失败关闭。
- 公开 API 使用 `X-API-Key`，EchoMind 调用 AskData 使用独立的 `X-Internal-API-Key`。
- 不允许模型直接持有数据库凭据或绕过执行服务连接数据库。
- 接入生产数据库前，必须补充数据源白名单、表字段权限和 SQL 审计。
- 当前代码尚未实现结果校验和模块级回溯，不应宣称已经形成完整 Reflection 闭环。

## 当前边界

该项目当前不包含：

- 连接真实业务数据的数据可视化前端；
- 数据库写入操作；
- 标准远程 MCP Server；
- 多生产数据库接入；
- 未经验证的准确率或性能指标。
