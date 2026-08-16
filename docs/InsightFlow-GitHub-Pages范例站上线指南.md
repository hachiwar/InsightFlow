# InsightFlow GitHub Pages 范例站上线指南

本文面向第一次发布网站的开发者，说明如何把仓库中的 `demo-site` 发布为公开范例站。该方案不需要购买服务器，适合项目展示、面试演示和前端功能验证。

文档核对日期：2026 年 8 月 16 日。

## 1. 先理解上线后的结构

GitHub Pages 只托管构建后的 HTML、CSS、JavaScript 和 WebAssembly 静态文件。范例站的样例 SQLite 数据库在访问者的浏览器内创建和查询，不会连接真实银行或企业数据库。

```text
访问者浏览器
  ├── GitHub Pages：加载静态页面
  ├── SQLite WebAssembly：创建和查询公开样例数据
  └── 可选模型端点：使用访问者临时填写的 API Key 生成 SQL
```

这与根目录 `compose.yaml` 的完整后端部署不同。GitHub Pages 展示完整项目架构，并在浏览器内真实运行 Text2SQL 样例；Docker Compose 部署用于实际运行 MindAgent、DataAgent、Redis 和 Caddy 服务。

## 2. 当前范例包含什么

项目总览展示以下仓库主流程：

- MindAgent 统一 `/chat` 入口、API 鉴权和会话上下文；
- 知识问答、技术支持、账单账户和数据分析四类意图路由；
- 工作记忆、情节记忆、用户画像、知识库 RAG 和回答校验；
- MindAgent 数据路由 → DataAgent 的跨服务数据查询链路；
- MindAgent、DataAgent 和部署层的职责边界；
- 熔断、Agent 降级、监控、评测、只读执行和容器隔离；
- Caddy、MindAgent、DataAgent、Redis 的生产部署拓扑。

上述 Java、Python 和容器能力属于交互式架构展示，不会在 GitHub Pages 内启动。数据实验室真实包含：

- 5 张有关联关系的样例表：客户、银行账户、订单、订单成本和月度目标；
- 3 个多表复杂场景：地区连续亏损诊断、有存款但长期未消费客户识别、收入增长但利润下滑归因；
- 6 个可见阶段：关键词识别、Schema 召回、查询规划、SQL 生成、只读执行和结果解释；
- 可编辑 SQL 和再次执行能力；
- 单条 `SELECT` / `WITH` 安全检查和最多 100 行结果限制；
- 可选的 OpenAI 兼容模型端点、模型名称和临时 API Key 输入。

本地演示模式只覆盖 3 个经过验证的场景，不宣称能够处理任意问题。启用自定义模型后，模型会根据当前问题和召回的 Schema 动态生成 SQL。

## 3. 合并代码到 `main`

GitHub Pages 工作流只在 `main` 分支发布。先打开仓库中的 Draft PR，确认 CI 通过，然后将其合并到 `main`：

1. 打开当前待合并的 InsightFlow Pull Request。
2. 确认 `verify` 检查为绿色。
3. 将 Draft PR 转为可审查状态。
4. 单击 `Merge pull request`。
5. 打开 `main` 分支，确认存在 `demo-site` 和 `.github/workflows/pages.yml`。

## 4. 在 GitHub 中启用 Pages

这一步只需要执行一次，并且需要仓库管理员权限：

1. 打开 [InsightFlow 仓库](https://github.com/hachiwar/InsightFlow)。
2. 依次进入 `Settings` → `Pages`。
3. 在 `Build and deployment` 下，将 `Source` 选择为 `GitHub Actions`。
4. 保持其他选项不变。

GitHub 官方说明见[配置 GitHub Pages 发布源](https://docs.github.com/zh/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)和[使用自定义工作流发布 GitHub Pages](https://docs.github.com/zh/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 5. 触发第一次发布

合并到 `main` 后，如果本次提交修改了 `demo-site` 或 Pages 工作流，发布会自动开始。也可以手动触发：

1. 打开仓库的 `Actions` 页面。
2. 在左侧选择 `Deploy demo to GitHub Pages`。
3. 单击 `Run workflow`，分支选择 `main`。
4. 等待 `build` 和 `deploy` 两个任务均变为绿色。

发布成功后，默认地址为：

```text
https://hachiwar.github.io/InsightFlow/
```

如果地址返回 `404`，先确认 Pages 的 `Source` 已设置为 `GitHub Actions`，再检查 Actions 中最近一次 `Deploy demo to GitHub Pages` 的日志。

## 6. 验收范例站

打开公开地址后，按以下顺序检查：

- [ ] 项目总览明确说明“真实运行”“可选运行”和“架构展示”的边界；
- [ ] 统一入口可以切换知识问答、技术支持、账单账户和数据分析四类路由；
- [ ] 页面展示 MindAgent、DataAgent、部署三层职责，以及记忆、RAG、安全和上线流程；
- [ ] 数据实验室显示“本地演示模式”和“样例数据仅在浏览器内”；
- [ ] 样例数据库显示 5 张表及其字段；
- [ ] 默认问题自动完成 6 个阶段；
- [ ] 生成 SQL 只包含 `SELECT` 或 `WITH` 查询；
- [ ] 执行结果能够识别连续亏损地区；
- [ ] 另外两个复杂范例也能返回数据；
- [ ] 将 SQL 改成 `DELETE FROM customers` 后，页面拒绝执行；
- [ ] 手机浏览器中各区域按纵向排列，表格可以横向滚动；
- [ ] 刷新页面后，API Key 输入框为空。

## 7. 使用自定义模型

展开“连接自定义模型”，填写：

1. 完整的 Chat Completions API 地址，例如服务商提供的 `/v1/chat/completions` 地址；
2. 服务商要求的模型名称；
3. 临时、限额 API Key；
4. 开启“使用模型动态生成 SQL”，然后提交业务问题。

模型端点必须兼容 OpenAI Chat Completions 请求格式，并允许来自 GitHub Pages 域名的浏览器跨域请求。若页面提示网络或 CORS 错误，表示该端点不允许浏览器直接访问。此时应继续使用本地演示模式，或者自行部署一个受鉴权、限流和允许来源控制的服务端代理。

## 8. API Key 安全边界

范例站不会把 API Key 写入 `localStorage`、`sessionStorage`、Cookie、URL 或 Git 仓库，刷新页面后 Key 会消失。但是，GitHub Pages 无法像服务器一样保护密钥，浏览器必须把 Key 直接发送到用户填写的模型端点。

因此必须遵守以下要求：

- 只使用临时、低额度、可以立即撤销的 Key；
- 不使用生产系统长期 Key；
- 不在共享电脑或直播、截图环境中输入 Key；
- 在模型服务商控制台设置费用上限和用量提醒；
- 使用后及时撤销临时 Key。

OpenAI 官方 API 文档明确要求不要在浏览器等客户端代码中暴露 API Key，生产应用应在服务端从环境变量或密钥管理服务加载密钥。参见 [OpenAI API 身份验证说明](https://platform.openai.com/docs/api-reference/authentication)。

## 9. 本地运行和修改

需要 Node.js 22.12 或更高版本。进入仓库后执行：

```bash
cd demo-site
npm ci
npm test
npm run dev
```

终端会输出本地访问地址。修改代码后，在提交前执行：

```bash
npm test
npm run build
```

构建产物位于 `demo-site/dist`，该目录由 Git 忽略，不需要提交。推送到 `main` 后，GitHub Actions 会重新测试、构建并发布。

## 10. 不能用 GitHub Pages 完成的事项

GitHub Pages 范例站不能安全替代 InsightFlow 后端，不能用于：

- 保存平台统一模型密钥；
- 连接内网或生产数据库；
- 实施用户登录、数据库行列权限和 SQL 审计；
- 保存对话历史或业务数据；
- 运行 MindAgent Java 服务、DataAgent Python 服务或 Redis；
- 对外提供生产级 Text2SQL 服务。

需要上述能力时，应按照[国内服务器上线指南](InsightFlow国内服务器上线指南.md)部署完整后端，并在接入真实数据前完成数据权限、审计、备份和隐私审查。
