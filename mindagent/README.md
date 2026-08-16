# MindAgent Java

MindAgent 是 InsightFlow 的统一对话与 Agent 编排服务。它基于 Java 21、Spring Boot 3.5 和 Spring AI，负责会话记忆、企业知识 RAG、意图识别、专业 Agent 路由、回答校验、评测和监控；数据分析问题通过 HTTP 调用 DataAgent。

## 核心链路

```text
POST /chat
→ 读取 Redis 工作记忆、历史摘要与用户画像
→ 查询改写与企业知识 Hybrid RAG
→ 识别 GENERAL / TECHNICAL / BILLING / DATA_QUERY
→ GeneralAgent / TechnicalAgent / BillingAgent / DataAgent
→ 回答校验与人工升级判断
→ 写回会话和用户画像
→ 返回 ChatResponse
```

数据查询：

```text
MindAgent DATA_QUERY
→ DataAgentClient
→ POST DataAgent /query
→ answer + verification + SQL audit
→ 组织为可读对话回复
```

## 技术栈

| 类别 | 技术 |
|---|---|
| 语言与框架 | Java 21、Spring Boot 3.5、Spring AI 1.1 |
| 模型 | DeepSeek、Anthropic Spring profile |
| 记忆 | Redis 工作记忆、JSON 历史摘要与用户画像 |
| 知识库 | BM25、本地 Hash Vector、加权融合、LLM Rerank |
| 文档处理 | LangChain4j DocumentSplitter |
| 可靠性 | 超时、缓存、熔断、Fallback、回答校验 |
| 评测 | Intent Accuracy、Macro-F1、LLM-as-Judge、Baseline 回归 |
| 监控 | Actuator、Micrometer、Prometheus、Webhook |
| 文档与部署 | Springdoc OpenAPI、Docker、Docker Compose |

## 主要组件

| 组件 | 职责 |
|---|---|
| `MindAgentController` | 对话、知识库、监控和评测 API |
| `MemoryManager` | 工作记忆、摘要、长期记忆和画像 |
| `KnowledgeToolManager` | 查询改写、并行召回、融合、Rerank 与可靠性控制 |
| `IntentRecognizer` | LLM、字符 n-gram 和模式规则融合识别 |
| `AgentOrchestrator` | 专业 Agent 路由、复合问题并行和失败降级 |
| `AnswerVerifier` | 可信度、依据和人工升级校验 |
| `DataAgentClient` | DataAgent HTTP 契约与答案格式化 |
| `EndToEndEvaluator` | 意图与回答质量评测、Baseline 对比 |
| `PerformanceMonitor` | 成功率、延迟、指标和告警 |

## API

默认地址为 `http://127.0.0.1:8080`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| POST | `/chat` | 统一对话入口 |
| POST | `/search` | 企业知识检索 |
| POST | `/knowledge/add` | 批量添加知识文档 |
| POST | `/knowledge/upload` | 上传 `.txt`、`.md`、`.json` |
| GET | `/knowledge/stats` | 知识库统计 |
| GET | `/monitor` | 监控摘要 |
| GET | `/metrics` | Prometheus 文本指标 |
| GET | `/actuator/prometheus` | Actuator Prometheus 指标 |
| POST | `/eval/run` | 运行评测 |
| GET | `/docs` | Swagger UI |
| GET | `/v3/api-docs` | OpenAPI JSON |

请求示例：

```bash
curl -X POST http://127.0.0.1:8080/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "message":"近 6 个月收入增长但利润下降的月份有哪些？",
    "user_id":"u1001",
    "conversation_id":"demo-session"
  }'
```

响应示例：

```json
{
  "conversation_id": "demo-session",
  "response": "...",
  "intent": "DATA_QUERY",
  "agent_type": "data",
  "escalated": false,
  "latency_ms": 123,
  "knowledge_used": false,
  "verified": true,
  "grounded": true
}
```

## 模型配置

### DeepSeek

```bash
export SPRING_PROFILES_ACTIVE=deepseek
export DEEPSEEK_API_KEY=your-key
export DEEPSEEK_BASE_URL=https://api.deepseek.com
export DEEPSEEK_MODEL=deepseek-v4-flash
```

### Anthropic

```bash
export SPRING_PROFILES_ACTIVE=anthropic
export ANTHROPIC_API_KEY=your-key
export ANTHROPIC_BASE_URL=https://api.anthropic.com
export ANTHROPIC_MODEL=claude-sonnet-5
```

DataAgent 连接：

```bash
export DATAAGENT_BASE_URL=http://127.0.0.1:8090
export DATAAGENT_TIMEOUT_MS=30000
export DATAAGENT_API_KEY=your-internal-key
```

## 本地运行

准备 JDK 21、Maven 和 Redis。先启动 DataAgent，再运行：

```bash
mvn spring-boot:run
```

Windows PowerShell：

```powershell
$env:SPRING_PROFILES_ACTIVE = "deepseek"
$env:DEEPSEEK_API_KEY = "your-key"
$env:DATAAGENT_BASE_URL = "http://127.0.0.1:8090"
mvn spring-boot:run
```

验证：

```bash
curl http://127.0.0.1:8080/health
```

## 测试

```bash
mvn --batch-mode test
```

测试覆盖数据意图规则回退、公开 API 鉴权，以及 DataAgent 内部密钥和问题导向答案契约。

## Docker

完整项目在仓库根目录统一启动：

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

完整部署说明见仓库根目录的 `docs/InsightFlow国内服务器上线指南.md`。
