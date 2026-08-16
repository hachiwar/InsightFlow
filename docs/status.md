# 实现状态

本文档区分“原项目已有”“本次已接通”“仅存在于方案文档”和“后续计划”，防止项目介绍超出代码证据。

## 状态定义

| 状态 | 含义 |
|---|---|
| 已实现 | 原项目代码中已有，并可从调用链确认 |
| 已接通 | 本次合并已增加最小接口或路由 |
| 部分实现 | 已有核心代码，但与完整设计存在差距 |
| 待实现 | 当前代码中不存在或尚未接入主链路 |

## 合并能力矩阵

| 能力 | 状态 | 说明 |
|---|---|---|
| EchoMind 统一 `/chat` 入口 | 已实现 | Java Spring Boot 接口 |
| 客服意图识别 | 已实现 | LLM、字符相似度和模式规则融合 |
| `DATA_QUERY` 意图 | 已接通 | 已加入模板、模式词和路由映射 |
| General、Technical、Billing Agent | 已实现 | EchoMind 原有能力 |
| DataAgent | 已接通 | 通过 HTTP 调用 AskData |
| AskData 健康检查 | 已接通 | `GET /health` |
| AskData 查询接口 | 已接通 | `POST /query` |
| 公开 API 鉴权 | 已接通 | 容器部署强制使用 `X-API-Key` |
| AskData 内部鉴权 | 已接通 | EchoMind 使用独立的 `X-Internal-API-Key` |
| 字段级 Schema 检索 | 已实现 | AskData 核心代码 |
| 关键词与向量混合召回 | 已实现 | 当前使用本地哈希向量作为可运行降级实现 |
| RRF 融合 | 已实现 | AskData 检索链路 |
| 远程 Rerank | 部分实现 | 需要有效服务配置；否则使用降级排序 |
| SchemaGraph | 已实现 | AskData 检索结果构建 |
| CoT 四元组规划 | 已实现 | Mock 仅在显式启用时接受演示查询 |
| SQL 生成 | 已实现 | 公开部署默认禁用 Mock |
| SQLite 查询执行 | 已实现 | 只读连接、执行超时、最多返回 100 行 |
| GitHub Pages 项目展示站 | 已实现 | 交互展示统一入口、四类 Agent、记忆、RAG、Text2SQL、安全与部署；浏览器内真实运行 SQLite、3 个复杂多表场景和完整执行轨迹 |
| 自定义模型 Text2SQL | 已实现（演示） | 浏览器调用用户填写的 OpenAI 兼容端点；受端点 CORS 策略限制 |
| 前端 SQL 只读检查 | 已实现 | 仅允许单条 `SELECT` / `WITH`，拒绝写入与结构变更关键字 |
| 单机容器部署 | 已实现 | 根级 Compose 启动 Caddy、EchoMind、AskData 和 Redis |
| HTTPS | 已实现 | Caddy 在配置域名后自动管理证书 |
| 标准远程 MCP Server | 待实现 | 当前 `MCPRouter` 是进程内路由抽象 |
| 多生产数据库接入 | 待实现 | 文档有设计，当前 Demo 未实现 |
| 结果一致性校验 | 待实现 | AskData Pipeline 尚未包含 |
| 模块级错误回溯 | 待实现 | 仅存在于方案与面试文档 |
| 数据查询结果自然语言总结 | 部分实现 | DataAgent 当前只格式化 SQL 和行结果 |
| 数据查询专用评测集 | 待实现 | 需要意图、SQL 和答案三层指标 |
| 生产级 SQL 安全治理 | 部分实现 | 已限制只读、超时和行数；尚缺真实数据源的表字段白名单与审计 |

## 已验证内容

- Python 安全回归测试通过；
- Java 单元测试和 Maven 构建通过；
- AskData 和 EchoMind Docker 镜像构建通过；
- 根级 `compose.yaml` 解析通过；
- 范例站 3 个复杂查询场景和 SQL 只读拦截测试通过；
- Vite 生产构建通过；
- `GET /health` 返回 `{"status":"ok"}`；
- 公开接口未授权返回 `401`，AskData 非法请求返回 `400`；
- Caddy → EchoMind → AskData → SQLite 端到端查询通过，返回 `agent_type=data`；
- Redis、AskData 和 EchoMind 未向主机公开端口。

## 后续顺序

1. 增加 DataAgent 与 AskData 的独立 HTTP 集成测试。
2. 增加数据意图冲突用例和路由评测。
3. 定义稳定的数据查询响应结构。
4. 接入真实数据库前，增加数据源、表和字段白名单以及 SQL 审计。
5. 确认需要真实多数据库后，再实现标准 MCP Server 或数据库适配器。
6. 最后实现结果校验和有限次数的模块级回溯。
