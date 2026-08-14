# 架构设计

## 设计原则

### 统一入口

EchoMind 负责 HTTP 接入、用户身份、会话上下文、意图识别、Agent 路由、监控和评测。业务调用方只依赖 EchoMind，不直接编排 AskData 内部模块。

### 能力隔离

AskData 作为独立 Python 服务运行，负责 Schema 检索、查询规划、SQL 生成和数据库执行。该边界避免将 Python 检索代码整体重写为 Java，也便于单独限制数据库权限。

### 复用现有实现

合并时只增加数据查询意图、DataAgent 和服务适配层。EchoMind 已有的记忆、监控和降级能力继续作为统一基础设施，不在 AskData 内重复实现。

## 模块职责

| 模块 | 来源 | 职责 |
|---|---|---|
| `EchoMindController` | EchoMind | 提供 `/chat`、知识库、监控和评测接口 |
| `IntentRecognizer` | EchoMind | 识别客服、技术、账单、账户和数据查询意图 |
| `AgentOrchestrator` | EchoMind | 将请求路由至专业 Agent，并在失败时降级 |
| `MemoryManager` | EchoMind | 管理会话消息、摘要和用户上下文 |
| `DataAgent` | 合并层 | 调用 AskData，并将结构化查询结果转换为对话响应 |
| `AskDataText2SQLPipeline` | AskData | 编排 Schema 检索、CoT、SQL 生成和执行 |
| `HybridSchemaRetrievalService` | AskData | 执行关键词与向量召回、融合、重排和 SchemaGraph 构建 |
| `CotPlanner` | AskData | 生成“数据库、处理对象、操作指令、输出目标”四元组 |
| `SqlGenerator` | AskData | 根据局部 Schema 和规划步骤生成 SQL |
| `MCPRouter` | AskData | 将执行请求路由至已注册的数据库执行器 |

## 请求流程

### 知识与客服请求

```text
/chat
→ 读取记忆
→ 检索知识库
→ 识别意图
→ General / Technical / Billing Agent
→ 写入记忆
→ 返回响应
```

### 数据分析请求

```text
/chat
→ 读取记忆
→ 识别 DATA_QUERY
→ DataAgent
→ POST AskData /query
→ 提取检索关键词
→ 混合召回 Schema
→ 构建 SchemaGraph
→ 生成 CoT 四元组
→ 生成 SQL
→ 执行查询
→ 返回 SQL、结果和执行轨迹
→ EchoMind 写入会话记忆
```

## 接口契约

AskData 查询请求：

```json
{
  "query": "查询总交易笔数大于 50000 的用户利率"
}
```

当前响应直接序列化 `PipelineResult`，包含 `query`、`keywords`、`schema_context`、`cot_output` 和 `step_logs`。后续可在确有消费者需求时增加稳定的 `answer`、`columns`、`verified` 和 `error` 字段。

## 意图路由

新增意图为 `DATA_QUERY`，对应 Agent 类型为 `DATA`。第一阶段沿用 LLM、字符 n-gram 相似度和规则模式三路识别机制，并增加统计、总额、平均、排名、趋势、同比、环比、交易笔数和销售额等模式词。

下列问题需要后续评测覆盖：

- “退款金额是多少”同时包含账单词和统计词；
- “订单状态是什么”属于客服查询，而非数据库分析；
- “解释刚才的销售趋势”可能应复用历史结果，而非重新查库；
- 数据问题中同时包含技术故障或人工升级诉求。

## 失败处理

- AskData 返回非 `200` 状态或请求超时时，DataAgent 返回失败结果。
- AgentOrchestrator 将失败的专业 Agent 降级到 GeneralAgent。
- 数据库执行错误保留在 AskData 执行结果中。
- 当前不进行自动重试和模块级回溯，避免重复执行高成本查询。

## 部署建议

开发环境可以分别启动 Java 和 Python 进程。容器化阶段应增加 AskData 服务，并通过容器内部网络配置 `ASKDATA_BASE_URL`。

生产部署前必须补充：

- 服务鉴权；
- TLS 或可信内网边界；
- 数据源只读账号；
- SQL 语句和表字段白名单；
- 查询超时、并发和结果规模限制；
- 访问日志脱敏；
- 可复现的回归评测集。
