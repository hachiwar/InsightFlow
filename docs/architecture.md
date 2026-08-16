# InsightFlow 架构设计

## 1. 设计目标

InsightFlow 将企业对话与结构化数据查询拆成两个职责清晰的服务：

- **MindAgent** 是业务入口，管理身份、会话、企业知识和 Agent 路由；
- **DataAgent** 是只读数据工具，管理 Schema、查询规划、SQL、执行治理和结果证据；
- 两者通过 HTTP 契约协作，业务调用方只依赖 `/chat`。

这种边界让 Java 侧专注业务编排，让 Python 侧复用检索和 Text2SQL 生态，同时把数据库凭据和模型输出限制在独立执行层。

## 2. 组件关系

```text
Internet
   │
   ▼
Caddy ── HTTPS / X-API-Key
   │
   ▼
MindAgent :8080
   ├── Redis :6379
   │     └── 工作记忆、TTL
   ├── JSON Store
   │     └── 知识库、历史摘要、用户画像、评测基线
   ├── GeneralAgent / TechnicalAgent / BillingAgent
   └── DataAgentClient ── X-Internal-API-Key
                              │
                              ▼
                         DataAgent :8090
                              ├── Schema Retrieval
                              ├── CoT Planner
                              ├── SQL Generator / Repair
                              ├── SQL Governance / MCPRouter
                              └── Read-only SQLite
```

## 3. MindAgent

| 组件 | 职责 |
|---|---|
| `MindAgentController` | `/chat`、知识库、监控、评测和 Swagger API |
| `MemoryManager` | 读取和写入工作记忆、摘要与用户画像 |
| `KnowledgeToolManager` | 查询改写、并行召回、融合、Rerank、缓存、超时与熔断 |
| `IntentRecognizer` | 融合 LLM、字符相似度和模式规则识别业务意图 |
| `AgentOrchestrator` | 路由专业 Agent，并在服务失败时降级 |
| `AnswerVerifier` | 校验回答依据与人工升级条件 |
| `DataAgentClient` | 调用 DataAgent，并将 `answer`、校验与步骤轨迹转换为对话结果 |

### 对话请求

```text
POST /chat
→ API Key 校验
→ 读取工作记忆、历史摘要与用户画像
→ 查询改写与企业知识检索
→ 意图识别
→ General / Technical / Billing / Data Agent
→ 回答校验
→ 写回会话与画像
→ 返回 ChatResponse
```

`DATA_QUERY` 会进入 DataAgent；专业 Agent 出错时由编排器统一生成可解释的降级响应。

## 4. DataAgent

| 组件 | 职责 |
|---|---|
| `HybridSchemaRetrievalService` | 关键词与向量检索、RRF、Rerank、SchemaGraph |
| `CotPlanner` | 生成数据库、输入对象、操作指令、输出目标四元组 |
| `LocalSchemaStore` | 为每个查询步骤提取最小局部 Schema |
| `SqlGenerator` | 生成 SQL，并根据数据库错误有限修复 |
| `validate_readonly_sql` | 单语句、只读关键字、危险函数和表白名单校验 |
| `MCPRouter` | 按数据库名称路由已注册执行器 |
| `SQLiteMCPExecutor` | 只读连接、超时、行数上限、结果与审计 |
| `verify_step_logs` | 校验执行状态、行数、列集合、数值和 SQL 策略 |
| `summarize_step_logs` | 结合原问题和已校验结果生成自然语言答案 |

### 数据查询请求

```text
POST /query
→ 内部 API Key 与请求体限制
→ 提取关键词
→ 混合召回字段级 Schema
→ 构建 SchemaGraph
→ 规划一个或多个 CoT 步骤
→ 按局部 Schema 生成 SQL
→ SQL 治理
→ 只读数据库执行
→ 执行失败时最多修复 2 次
→ 结果一致性校验
→ 问题导向总结
→ 返回步骤、答案、校验与审计
```

## 5. 接口契约

### DataAgent 请求

```http
POST /query
X-Internal-API-Key: <internal-key>
Content-Type: application/json

{
  "query": "查询总交易笔数大于 50000 的用户利率"
}
```

### DataAgent 响应

```json
{
  "success": true,
  "error": null,
  "query": "查询总交易笔数大于 50000 的用户利率",
  "keywords": ["总交易笔数", "利率"],
  "schema_context": "...",
  "cot_output": "...",
  "answer": "问题……共匹配 5 条记录，年化利率为……",
  "verified": true,
  "verification": {
    "verified": true,
    "checks": [
      {
        "step": 1,
        "execution_success": true,
        "row_count_matches": true,
        "columns_match_rows": true,
        "numeric_values_are_finite": true,
        "sql_policy_verified": true,
        "verified": true
      }
    ]
  },
  "step_logs": [
    {
      "database": "trade_db",
      "sql": "SELECT ...",
      "attempts": [
        { "attempt": 1, "sql": "SELECT ...", "success": true, "error": null }
      ],
      "execution_result": {
        "success": true,
        "columns": ["interest_rate"],
        "rows": [{ "interest_rate": 4.58 }],
        "row_count": 1,
        "truncated": false,
        "audit": {
          "query_id": "...",
          "database": "trade_db",
          "sql_fingerprint": "...",
          "duration_ms": 1.2,
          "success": true,
          "policy": {
            "verified": true,
            "statement_type": "SELECT",
            "tables": ["interest_info", "trade_summary"],
            "checks": ["single_statement", "readonly_statement", "blocked_keywords", "table_allowlist"]
          },
          "error": null
        }
      }
    }
  ]
}
```

`success` 只有在所有查询步骤均执行成功且通过一致性校验时才为 `true`。MindAgent 优先展示 `answer`，同时保留步骤轨迹供日志、调试和评测使用。

## 6. SQL 安全模型

安全边界由多层共同组成：

1. **语法策略**：只接受一条 `SELECT` 或 `WITH`；
2. **关键字策略**：拒绝写入、DDL 和数据库管理指令；
3. **函数策略**：拒绝文件读写和扩展加载函数；
4. **对象策略**：`FROM` / `JOIN` 引用必须位于表白名单；
5. **连接策略**：SQLite 以只读 URI 打开，并启用 `query_only`；
6. **资源策略**：设置执行超时和最大返回行数；
7. **证据策略**：每次执行返回 SQL 指纹、耗时、策略结果和错误；
8. **结果策略**：行数、列集合、数值有效性和每步执行状态必须一致。

SQL 明文保留在受控的请求步骤中用于复核，审计摘要只保存 SHA-256 指纹，避免在审计字段重复泄露查询内容。

## 7. 失败与降级

- SQL 治理失败：立即拒绝，不访问数据库；
- 数据库语法或字段错误：把失败 SQL 和错误反馈给模型，最多修复 2 次；
- DataAgent 超时或非成功响应：MindAgent 编排器返回数据服务失败说明；
- 专业 Agent 异常：降级到 GeneralAgent；
- 知识 Rerank 或外部工具异常：使用缓存或融合排序结果；
- 前端模型解释异常：回退到基于真实查询结果的本地问题导向总结。

所有降级均保留明确模式或错误信息，不把失败伪装成成功结果。

## 8. 部署边界

根目录 `compose.yaml` 提供单机部署：

- Caddy 是唯一公开端口；
- MindAgent、DataAgent、Redis 只连接 Compose 内部网络；
- 公开和内部 API 使用不同密钥；
- DataAgent 与 MindAgent 使用只读容器文件系统，持久化目录通过命名卷挂载；
- 健康检查控制服务启动顺序；
- `scripts/smoke_test.py` 验证 `/health` 和完整 `/chat` 数据链路。

GitHub Pages 仅承载 React + sql.js 范例站，浏览器内 SQLite 与服务器 Compose 是两条互不共享密钥的数据路径。

## 9. 验证策略

- Python：SQL 拒绝、表白名单、审计和 Pipeline 结果校验；
- Java：意图、编排、DataAgent 客户端、鉴权、知识检索和 API 测试；
- Frontend：3 个复杂 SQL 场景、只读拦截、模型协议、解释和错误修复；
- Deployment：Compose 配置解析、容器健康检查和端到端冒烟测试；
- CI：Pull Request 与 `main` 使用同一组自动化检查。
