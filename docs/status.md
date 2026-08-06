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
| 字段级 Schema 检索 | 已实现 | AskData 核心代码 |
| 关键词与向量混合召回 | 已实现 | 当前使用本地哈希向量作为可运行降级实现 |
| RRF 融合 | 已实现 | AskData 检索链路 |
| 远程 Rerank | 部分实现 | 需要有效服务配置；否则使用降级排序 |
| SchemaGraph | 已实现 | AskData 检索结果构建 |
| CoT 四元组规划 | 已实现 | 无模型密钥时使用 Mock |
| SQL 生成 | 已实现 | 无模型密钥时使用 Mock |
| SQLite 查询执行 | 已实现 | 当前演示数据源 |
| 标准远程 MCP Server | 待实现 | 当前 `MCPRouter` 是进程内路由抽象 |
| 多生产数据库接入 | 待实现 | 文档有设计，当前 Demo 未实现 |
| 结果一致性校验 | 待实现 | AskData Pipeline 尚未包含 |
| 模块级错误回溯 | 待实现 | 仅存在于方案与面试文档 |
| 数据查询结果自然语言总结 | 部分实现 | DataAgent 当前只格式化 SQL 和行结果 |
| 数据查询专用评测集 | 待实现 | 需要意图、SQL 和答案三层指标 |
| 生产级 SQL 安全治理 | 待实现 | 当前仅有 SQLite 演示执行器 |

## 已验证内容

- `askdata_pipeline.http_server` 通过 Python 语法检查；
- AskData 端到端 Demo 在 UTF-8 输出环境中成功运行；
- `GET /health` 返回 `{"status":"ok"}`；
- `POST /query` 可生成并执行演示查询；
- 示例查询返回对应结果行。

EchoMind 自带 `mvnw.cmd` 当前无法运行，原因是 `.mvn/wrapper/maven-wrapper.jar` 缺少主清单属性。Java 融合代码尚未完成最终编译确认。

## 后续顺序

1. 修复或替换 Maven Wrapper，并完成 Java 编译。
2. 为 DataAgent 增加最小单元测试和 HTTP 集成测试。
3. 定义稳定的数据查询响应结构。
4. 增加数据意图冲突用例和路由评测。
5. 补充 SQL 白名单、超时和结果规模限制。
6. 确认需要真实多数据库后，再实现标准 MCP Server 或数据库适配器。
7. 最后实现结果校验和有限次数的模块级回溯。
