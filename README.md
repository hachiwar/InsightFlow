# InsightFlow：企业知识与数据问答 Agent

[在线演示](https://hachiwar.github.io/InsightFlow/) · [架构设计](docs/architecture.md) · [国内服务器上线指南](docs/InsightFlow国内服务器上线指南.md)

InsightFlow 是一套可运行的企业 Agent 工程：MindAgent 负责会话记忆、知识库 RAG、意图识别和多 Agent 编排；DataAgent 负责把自然语言数据问题转换为经过治理、执行、校验和解释的 SQL。项目提供 Java / Python 后端、浏览器内 SQLite 范例、Docker Compose 部署以及自动化测试。

## 为什么不是预存 SQL

报表脚本适合固定口径；业务问答经常同时包含动态时间、模糊概念、多表关系和追问上下文。例如：

- “近 6 个月收入增长但利润下降的月份，主要成本原因是什么？”
- “找出有银行存款、过去 90 天没有消费且余额大于 5 万的用户。”
- “哪些月份亏损？与上月相比，费用增长来自哪个分类？”

DataAgent 会按问题选择表与字段、补齐连接路径、组合聚合和窗口函数，并保留关键词、Schema、计划、SQL、执行结果、校验与审计信息供复核。

## 系统架构

```text
用户 / 业务系统
        │ POST /chat
        ▼
Caddy：HTTPS + 公开 API Key
        ▼
MindAgent（Java / Spring Boot）
  ├─ 会话记忆、历史摘要、用户画像
  ├─ 查询改写、Hybrid RAG、Rerank
  ├─ General / Technical / Billing Agent
  └─ DATA_QUERY ───────────────┐
                               ▼
DataAgent（Python）
  Schema 混合检索 → SchemaGraph → CoT 四元组规划
  → SQL 生成 → 只读治理 → 有限纠错 → 执行
  → 结果一致性校验 → 问题导向总结 → 审计轨迹
```

### MindAgent

- 统一 `/chat` API、API Key 鉴权和 OpenAPI 文档；
- Redis 工作记忆、持久化摘要和用户画像；
- LLM、字符相似度与规则融合的意图识别；
- General、Technical、Billing、Data 四类路由；
- 企业知识库 BM25 + 本地向量混合检索、查询改写与 LLM Rerank；
- 回答校验、人工升级、服务降级、评测与 Micrometer 监控。

### DataAgent

- 关键词、向量、RRF 与 Rerank 组成的字段级 Schema 检索；
- SchemaGraph 和“数据库、输入、操作、输出”CoT 四元组规划；
- 局部 Schema 驱动的 SQL 生成与最多 2 次错误反馈修复；
- 单语句、只读关键字、危险函数和表白名单治理；
- SQLite 只读连接、查询超时、结果行数上限；
- 行列一致性、有限数值和策略结果校验；
- 问题导向自然语言答案及 SQL 指纹、耗时和错误审计。

## 在线演示

[GitHub Pages 范例站](https://hachiwar.github.io/InsightFlow/) 使用 React、sql.js 和 WebAssembly 在浏览器内真实执行 5 张样例表，展示完整数据链路。内置 3 个复杂多表场景，无需 API Key。

页面也支持临时填写 OpenAI Chat Completions 兼容端点。启用后，模型负责动态 SQL、错误修复和结果解释；执行仍由浏览器只读沙盒完成。API Key 只保存在当前页面内存，刷新即清除。问题、相关 Schema、SQL 和结果会发送到用户填写的模型端点，因此只应使用临时限额 Key和公开样例数据。

本地运行：

```bash
cd demo-site
npm ci
npm run dev
```

测试与生产构建：

```bash
npm test
npm run build
```

## 快速启动完整服务

需要 Docker Engine、Docker Compose 插件和可用的大模型 API Key。

```bash
cp .env.example .env
# 编辑 .env：替换三个密钥，并填写 MindAgent / DataAgent 模型配置
docker compose config --quiet
docker compose up -d --build
docker compose ps
python3 scripts/smoke_test.py \
  --base-url http://127.0.0.1 \
  --api-key '<MINDAGENT_API_KEY>'
```

Compose 启动 `proxy`、`mindagent`、`dataagent` 和 `redis`。只有 Caddy 映射主机的 `80/443`，其余服务位于内部网络。域名、HTTPS、国内云服务器和防火墙配置见[国内服务器上线指南](docs/InsightFlow国内服务器上线指南.md)。

## 本地分别运行

### DataAgent

```powershell
cd dataagent/code/dataagent_agent/dataagent_agent
$env:PYTHONIOENCODING = "utf-8"
$env:DATAAGENT_ALLOW_MOCK = "true"
python -m dataagent_pipeline.http_server
```

默认地址为 `http://127.0.0.1:8090`：

- `GET /health`
- `POST /query`

```bash
curl -X POST http://127.0.0.1:8090/query \
  -H 'Content-Type: application/json' \
  -d '{"query":"查询总交易笔数大于 50000 的用户利率"}'
```

### MindAgent

```powershell
cd mindagent/MindAgentJava/MindAgentJava
$env:SPRING_PROFILES_ACTIVE = "deepseek"
$env:DEEPSEEK_API_KEY = "your-key"
mvn spring-boot:run
```

默认地址为 `http://127.0.0.1:8080`，Swagger UI 位于 `/docs`。

```bash
curl -X POST http://127.0.0.1:8080/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "message":"查询总交易笔数大于 50000 的用户利率",
    "user_id":"u1001"
  }'
```

## DataAgent 响应

`POST /query` 返回稳定的可审计结构：

```json
{
  "success": true,
  "query": "查询总交易笔数大于 50000 的用户利率",
  "answer": "问题……共匹配 5 条记录，年化利率为……",
  "verified": true,
  "verification": { "verified": true, "checks": [] },
  "step_logs": [
    {
      "database": "trade_db",
      "sql": "SELECT ...",
      "attempts": [
        { "attempt": 1, "sql": "SELECT ...", "success": true, "error": null }
      ],
      "execution_result": {
        "success": true,
        "rows": [],
        "audit": {
          "query_id": "...",
          "sql_fingerprint": "...",
          "duration_ms": 1.2,
          "policy": { "verified": true }
        }
      }
    }
  ]
}
```

MindAgent 优先使用 `answer` 组织对话回复，同时保留 SQL 和校验信息便于排查。

## 安全设计

- 模型输出在执行层按不可信输入处理；
- 公开 `X-API-Key` 与内部 `X-Internal-API-Key` 分离；
- SQL 仅允许一条 `SELECT` / `WITH`，拒绝 DML、DDL、管理指令和危险函数；
- 数据表必须在执行器白名单内；
- SQLite 同时使用只读 URI 与 `PRAGMA query_only = ON`；
- 容器使用只读文件系统、非特权模式和内部网络；
- 返回行数、请求体和执行时间均有限制；
- 审计记录不保存明文 SQL，只保存指纹、策略、耗时和错误；
- `.env`、数据库、日志、PDF 和本地面试材料均被 Git 忽略。

项目的工程范围是只读企业问答与 SQLite 演示数据，不提供数据库写操作，也不连接真实银行账户。接入企业数据时，应为每个数据源配置专用只读账号与最小化表白名单。

## 自动化验证

```bash
# Python：SQL 安全、白名单、审计、结果校验与完整 Pipeline
cd dataagent/code/dataagent_agent/dataagent_agent
python -m unittest discover -s tests -v

# Java：MindAgent 单元与集成测试
cd mindagent/MindAgentJava/MindAgentJava
mvn --batch-mode test

# 前端：3 个复杂场景、安全拦截、模型解释与修复协议
cd demo-site
npm test
npm run build

# 部署配置
docker compose config --quiet
```

GitHub Actions 对 `main` 和 Pull Request 自动执行上述 Python、Java、前端和 Compose 检查；Pages 工作流在 `main` 更新后发布范例站。

## 目录结构

```text
InsightFlow/
├── dataagent/       # Python Text2SQL、HTTP API、SQLite 执行与测试
├── mindagent/       # Java Spring Boot 对话编排、RAG、记忆、评测与测试
├── demo-site/       # React + sql.js 的 GitHub Pages 交互范例
├── deploy/          # Caddy 反向代理配置
├── scripts/         # 部署冒烟测试
├── docs/            # 架构与上线说明
├── compose.yaml     # 完整服务编排
└── .env.example     # 无密钥配置模板
```

## 面试演示建议

1. 用 2 分钟解释 MindAgent / DataAgent 的职责边界；
2. 在在线站点运行“盈利下降”或“存款未消费”场景，逐步查看关键词、Schema、计划、SQL、结果和解释；
3. 把 SQL 改成 `DELETE`，证明执行前会被拒绝；
4. 展示 DataAgent 的 `verified` 与 `audit` 返回；
5. 最后说明 Compose 的网络隔离、双密钥和冒烟测试。

详细契约与关键取舍见[架构设计](docs/architecture.md)。
