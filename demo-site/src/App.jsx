import { useEffect, useMemo, useRef, useState } from "react";
import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import {
  RELATIONS,
  MODEL_PROVIDERS,
  SAMPLE_QUESTIONS,
  SCHEMA,
  SNAPSHOT_DATE,
  assertReadonlySql,
  buildPipeline,
  executeReadonly,
  extractKeywords,
  formatNumber,
  getDemoDatabase,
  requestModelExplanation,
  requestModelRepair,
  summarizeResult,
} from "./agent.js";

const REPOSITORY = "https://github.com/hachiwar/InsightFlow";
const STAGES = ["关键词识别", "Schema 召回", "查询规划", "SQL 生成", "只读执行", "结果解释"];
const NAV_ITEMS = [
  ["overview", "项目总览", "01"],
  ["architecture", "系统架构", "02"],
  ["orchestration", "Agent 编排", "03"],
  ["data-lab", "数据链路", "04"],
  ["security", "安全治理", "05"],
  ["deployment", "部署运行", "06"],
  ["resume", "简历要点", "07"],
];
const ROUTE_SCENARIOS = [
  { id: "general", label: "知识问答", question: "公司的退款政策和到账时间是什么？", intent: "GENERAL", target: "GeneralAgent", steps: ["读取会话记忆", "改写问题并检索知识库", "生成有依据的回答", "校验回答并写回记忆"] },
  { id: "technical", label: "技术支持", question: "支付回调连续超时，应该先检查什么？", intent: "TECHNICAL", target: "TechnicalAgent", steps: ["合并上下文与知识片段", "识别技术意图和紧急度", "生成分步排查建议", "判断是否升级人工"] },
  { id: "billing", label: "账单账户", question: "为什么本月账单比上月多了 380 元？", intent: "BILLING", target: "BillingAgent", steps: ["读取账户与会话上下文", "识别账单意图", "路由账单 Agent", "失败时降级通用回答"] },
  { id: "data", label: "数据分析", question: "近 6 个月收入增长但利润下降的月份，主要成本原因是什么？", intent: "DATA_QUERY", target: "DataAgent", steps: ["MindAgent 识别数据意图", "DataAgent 召回 Schema", "规划查询并生成 SQL", "治理、执行、校验与解释"] },
];
const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
let didAutoRun = false;

function SectionHeading({ index, title, description }) {
  return <header className="section-heading"><span>{index}</span><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div></header>;
}

function Sidebar({ activeSection }) {
  return <aside className="sidebar">
    <a className="brand" href="#overview" aria-label="InsightFlow 项目总览"><span className="brand-mark" aria-hidden="true">IF</span><span><strong>InsightFlow</strong><small>Agent Engineering</small></span></a>
    <nav aria-label="页面导航">{NAV_ITEMS.map(([id, label, number]) => <a className={activeSection === id ? "active" : ""} href={`#${id}`} key={id}><span>{number}</span>{label}</a>)}</nav>
    <div className="sidebar-meta"><span>Java · Python · React</span><a href={REPOSITORY} target="_blank" rel="noreferrer">GitHub 源码 ↗</a></div>
  </aside>;
}

function Overview() {
  return <section className="page-section overview" id="overview">
    <div className="eyebrow"><span>Enterprise Agent System</span><span>2026</span></div>
    <div className="overview-grid"><div><h1>企业知识与<br />数据问答 Agent</h1><p>InsightFlow 将对话编排与数据推理连接为一条可运行链路：MindAgent 理解上下文并选择专业 Agent，DataAgent 将业务问题转换为经过治理、执行和校验的 SQL。</p><div className="hero-actions"><a className="primary-button" href="#data-lab">在线体验</a><a className="text-link" href={REPOSITORY} target="_blank" rel="noreferrer">查看源码 ↗</a></div></div>
      <div className="system-index" aria-label="系统组成"><article><span>01</span><div><strong>MindAgent</strong><p>会话记忆、企业知识 RAG、意图识别与 Agent 编排。</p></div></article><article><span>02</span><div><strong>DataAgent</strong><p>Schema 检索、查询规划、SQL 生成、治理执行与结果解释。</p></div></article><article><span>03</span><div><strong>Runtime</strong><p>Caddy、Redis、Docker Compose、健康检查与冒烟测试。</p></div></article></div>
    </div>
    <div className="principle-strip"><span>一个业务入口</span><span>两类推理职责</span><span>全链路可追踪</span><span>数据库只读边界</span></div>
  </section>;
}

function Architecture() {
  return <section className="page-section" id="architecture">
    <SectionHeading index="02" title="系统架构" description="对话层负责理解与路由，数据层负责查询推理；两者通过稳定的 HTTP 契约协作。" />
    <div className="architecture-flow"><article className="flow-entry"><span>ENTRY</span><strong>用户 / 业务系统</strong><p>POST /chat</p></article><b aria-hidden="true">→</b><article><span>GATEWAY</span><strong>Caddy</strong><p>HTTPS · API Key</p></article><b aria-hidden="true">→</b><article className="flow-primary"><span>ORCHESTRATOR</span><strong>MindAgent</strong><p>Memory · RAG · Router</p></article><b aria-hidden="true">→</b><article><span>DATA TOOL</span><strong>DataAgent</strong><p>Text2SQL · Audit</p></article></div>
    <div className="architecture-details"><article><span>对话上下文</span><h3>工作记忆 + 情节记忆</h3><p>Redis 保存近期消息与 TTL，历史摘要按当前问题检索；回答完成后更新会话与用户画像。</p></article><article><span>知识检索</span><h3>改写 + 并行召回 + Rerank</h3><p>查询改写后并行调用知识工具，通过缓存、超时和熔断控制外部依赖。</p></article><article><span>结构化数据</span><h3>SchemaGraph + CoT 规划</h3><p>从字段级元数据构建局部 Schema，生成数据库、输入、输出与依赖明确的查询步骤。</p></article></div>
  </section>;
}

function Orchestration() {
  const [scenarioId, setScenarioId] = useState("data");
  const scenario = ROUTE_SCENARIOS.find((item) => item.id === scenarioId);
  return <section className="page-section" id="orchestration">
    <SectionHeading index="03" title="Agent 编排" description="同一个入口根据意图、上下文与服务状态选择执行链，数据问题会跨服务进入 DataAgent。" />
    <div className="scenario-tabs" role="tablist" aria-label="业务场景">{ROUTE_SCENARIOS.map((item) => <button type="button" role="tab" aria-selected={item.id === scenarioId} className={item.id === scenarioId ? "active" : ""} onClick={() => setScenarioId(item.id)} key={item.id}>{item.label}</button>)}</div>
    <div className="route-board"><div className="route-input"><span>INPUT / POST /chat</span><blockquote>{scenario.question}</blockquote><dl><div><dt>意图</dt><dd>{scenario.intent}</dd></div><div><dt>目标</dt><dd>{scenario.target}</dd></div></dl></div><ol>{scenario.steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol></div>
  </section>;
}

function ResultTable({ result }) {
  if (!result) return <div className="empty-state">运行分析后显示 SQLite 查询结果</div>;
  if (!result.rows.length) return <div className="empty-state">查询成功，当前数据范围内没有匹配记录</div>;
  return <div className="table-wrap" tabIndex="0" aria-label="SQL 查询结果，可横向滚动"><table><thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{result.columns.map((column) => { const value = row[column]; const numeric = typeof value === "number"; return <td className={numeric && value < 0 ? "negative" : numeric ? "numeric" : ""} key={column}>{numeric ? formatNumber(value) : String(value ?? "—")}</td>; })}</tr>)}</tbody></table></div>;
}

function SchemaBrowser({ selectedNames }) {
  return <div className="schema-list">{SCHEMA.map((table) => <details className={selectedNames.has(table.name) ? "schema-table selected" : "schema-table"} key={table.name} open={selectedNames.has(table.name)}><summary><code>{table.name}</code><small>{table.label}</small></summary><div>{table.columns.map(([name, type, note]) => <p key={name}><code>{name}</code><span>{type}</span><small>{note}</small></p>)}</div></details>)}<details className="relations"><summary>表关系 · {RELATIONS.length}</summary>{RELATIONS.map((relation) => <code key={relation}>{relation}</code>)}</details></div>;
}

function DataLab() {
  const [question, setQuestion] = useState(SAMPLE_QUESTIONS[0]);
  const [database, setDatabase] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [result, setResult] = useState(null);
  const [sql, setSql] = useState("");
  const [explanation, setExplanation] = useState(null);
  const [activeStage, setActiveStage] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [modelEnabled, setModelEnabled] = useState(false);
  const [providerId, setProviderId] = useState("custom");
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const abortRef = useRef(null);
  const selectedNames = useMemo(() => new Set((pipeline?.tables ?? []).map((table) => table.name)), [pipeline]);
  const previewKeywords = pipeline?.keywords ?? extractKeywords(question);

  async function explain(nextPipeline, nextSql, nextResult, targetQuestion, signal) {
    const localText = summarizeResult(nextPipeline, nextResult);
    if (!modelEnabled) return { text: localText, mode: "本地规则总结" };
    try { const text = await requestModelExplanation({ endpoint, apiKey, model, question: targetQuestion, sql: nextSql, result: nextResult, signal }); return { text, mode: "模型问题导向解释" }; }
    catch { return { text: localText, mode: "模型失败 · 本地降级" }; }
  }

  async function analyze(targetQuestion = question, targetDatabase = database) {
    if (!targetDatabase || running || !targetQuestion.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => { timedOut = true; controller.abort(); }, 90_000);
    setRunning(true); setError(""); setExplanation(null); setResult(null); setActiveStage(1);
    try {
      if (!modelEnabled) await sleep(100);
      setActiveStage(2);
      let nextPipeline = await buildPipeline({ question: targetQuestion.trim(), modelConfig: modelEnabled ? { enabled: true, endpoint, model, apiKey } : null, signal: controller.signal });
      setPipeline(nextPipeline); setActiveStage(3);
      if (!modelEnabled) await sleep(100);
      setSql(nextPipeline.sql); setActiveStage(4); assertReadonlySql(nextPipeline.sql);
      if (!modelEnabled) await sleep(100);
      setActiveStage(5);
      let nextResult;
      for (let repairCount = 0; repairCount <= 2; repairCount += 1) {
        try { nextResult = executeReadonly(targetDatabase, nextPipeline.sql); break; }
        catch (executionError) {
          if (!modelEnabled || repairCount === 2) throw executionError;
          setActiveStage(3);
          const repaired = await requestModelRepair({ endpoint, apiKey, model, question: targetQuestion.trim(), tables: nextPipeline.tables, sql: nextPipeline.sql, error: executionError.message, signal: controller.signal });
          nextPipeline = { ...nextPipeline, ...repaired, repaired: true };
          setPipeline(nextPipeline); setSql(nextPipeline.sql); setActiveStage(5);
        }
      }
      setResult(nextResult);
      setExplanation(await explain(nextPipeline, nextPipeline.sql, nextResult, targetQuestion.trim(), controller.signal));
      setActiveStage(6);
    } catch (caught) {
      if (timedOut) setError("模型请求超过 90 秒，已停止等待。请检查端点后重试。");
      else if (caught.name !== "AbortError") setError(caught instanceof TypeError ? "浏览器无法访问该端点，请检查网络与 CORS 设置。" : caught.message);
    } finally { window.clearTimeout(timeoutId); setRunning(false); }
  }

  async function rerunSql() {
    if (!database || !pipeline) return;
    const controller = new AbortController(); abortRef.current?.abort(); abortRef.current = controller;
    setRunning(true); setError(""); setExplanation(null);
    try { setActiveStage(5); const nextResult = executeReadonly(database, sql); setResult(nextResult); setExplanation(await explain(pipeline, sql, nextResult, question.trim(), controller.signal)); setActiveStage(6); }
    catch (caught) { setError(caught.message); }
    finally { setRunning(false); }
  }

  useEffect(() => {
    let active = true;
    getDemoDatabase(initSqlJs, sqlWasmUrl).then((nextDatabase) => { if (!active) return; setDatabase(nextDatabase); if (!didAutoRun) { didAutoRun = true; setTimeout(() => analyze(SAMPLE_QUESTIONS[0], nextDatabase), 0); } }).catch((caught) => active && setError(`样例数据库初始化失败：${caught.message}`));
    return () => { active = false; abortRef.current?.abort(); };
  }, []);

  function chooseProvider(event) {
    const provider = MODEL_PROVIDERS.find((item) => item.id === event.target.value);
    setProviderId(provider.id);
    if (provider.endpoint) { setEndpoint(provider.endpoint); setModel(provider.model); setModelEnabled(true); }
  }

  return <section className="page-section data-lab" id="data-lab">
    <SectionHeading index="04" title="从业务问题到可审计 SQL" description="样例数据库在浏览器内真实执行。你也可以临时接入 OpenAI Chat Completions 兼容模型，观察动态生成与错误修复。" />
    <div className="stage-line" aria-label="执行阶段">{STAGES.map((stage, index) => { const number = index + 1; const state = number < activeStage ? "done" : number === activeStage ? "active" : ""; return <div className={state} key={stage}><span>{number < activeStage ? "✓" : number}</span><small>{stage}</small></div>; })}</div>
    {error ? <div className="error-banner" role="alert"><strong>本次分析未完成</strong><span>{error}</span></div> : null}
    <div className="lab-grid">
      <aside className="question-column"><div className="column-title"><span>QUERY</span><small>数据截至 {SNAPSHOT_DATE}</small></div><label htmlFor="question">业务问题</label><textarea id="question" value={question} maxLength="500" onChange={(event) => setQuestion(event.target.value)} /><div className="question-list">{SAMPLE_QUESTIONS.map((item, index) => <button type="button" onClick={() => setQuestion(item)} key={item}><span>0{index + 1}</span>{item}</button>)}</div><button className="run-button" type="button" disabled={!database || running || !question.trim()} onClick={() => analyze()}>{running ? "正在推理…" : database ? "运行完整链路" : "正在加载样例库…"}</button>
        <details className="model-settings"><summary>自定义大模型 <span>OpenAI 兼容接口</span></summary><label className="check-row"><input type="checkbox" checked={modelEnabled} onChange={(event) => setModelEnabled(event.target.checked)} />启用动态 SQL 与结果解释</label><label>服务商<select value={providerId} onChange={chooseProvider}>{MODEL_PROVIDERS.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></label><label>Chat Completions 地址<input type="url" autoComplete="off" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://example.com/v1/chat/completions" /></label><label>模型名称<input value={model} autoComplete="off" onChange={(event) => setModel(event.target.value)} /></label><label>临时 API Key<input type="password" value={apiKey} autoComplete="off" onChange={(event) => setApiKey(event.target.value)} /></label><p>Key 仅保存在页面内存。启用后问题、相关 Schema、SQL 与结果会发送到你填写的端点；请使用临时限额 Key。</p></details>
      </aside>
      <div className="trace-column"><div className="trace-summary"><article><span>KEYWORDS</span><div className="token-list">{previewKeywords.map((word) => <code key={word}>{word}</code>)}</div></article><article><span>SCHEMA RECALL</span><div className="token-list">{pipeline?.tables?.map((table) => <code key={table.name}>{table.name}</code>) ?? <small>运行后显示召回表</small>}</div></article></div><article className="plan-panel"><div className="column-title"><span>QUERY PLAN</span>{pipeline ? <small>{pipeline.repaired ? "自动纠错" : pipeline.mode === "model" ? "模型生成" : "本地可复现"}</small> : null}</div><h3>{pipeline?.title ?? "等待业务问题进入规划器"}</h3>{pipeline ? <ol>{pipeline.plan.map((step) => <li key={step}>{step}</li>)}</ol> : <p>运行后展示时间窗口、聚合口径、表连接和输出字段。</p>}</article><article className="sql-panel"><div className="column-title"><span>GENERATED SQL</span><div><button type="button" onClick={() => navigator.clipboard.writeText(sql)} disabled={!sql}>复制</button><button type="button" onClick={rerunSql} disabled={!sql || running}>重新执行</button></div></div><textarea aria-label="生成的 SQL，可编辑" spellCheck="false" value={sql} onChange={(event) => setSql(event.target.value)} placeholder="生成的只读 SQL 将显示在这里" /><p className="safety-note"><b>READ ONLY</b> 单条 SELECT / WITH · 写操作拦截 · 最多纠错 2 次</p></article></div>
      <aside className="data-column"><section><div className="column-title"><span>DEMO SCHEMA</span><small>{database ? "SQLite 已就绪" : "加载中"}</small></div><SchemaBrowser selectedNames={selectedNames} /></section><section className="result-section"><div className="column-title"><span>RESULT</span><small>{result ? `${result.rowCount} 行` : "等待执行"}</small></div><ResultTable result={result} />{explanation ? <div className="explanation"><span>{explanation.mode}</span><p>{explanation.text}</p></div> : null}</section></aside>
    </div>
    <div className="agent-rationale"><strong>为什么需要 Agent</strong><span>理解“最近”“盈利”“未消费”等动态口径</span><span>按问题选择表与连接路径</span><span>组合聚合、窗口函数和多步条件</span><span>保留 SQL、结果与解释供复核</span></div>
  </section>;
}

function Security() {
  return <section className="page-section" id="security"><SectionHeading index="05" title="安全治理" description="把模型输出视为不可信输入；校验、数据库权限和审计在执行层统一生效。" /><div className="security-grid"><article><span>01 / INPUT</span><h3>入口与密钥隔离</h3><p>公开 API 与内部服务使用不同密钥；模型 Key 只存于当前浏览器内存，不写入仓库和样例数据库。</p></article><article><span>02 / POLICY</span><h3>SQL 只读策略</h3><p>仅接受单条 SELECT / WITH，拦截写入、DDL、管理指令、危险函数和未授权数据表。</p></article><article><span>03 / DATABASE</span><h3>数据库双重限制</h3><p>SQLite 使用只读连接与 query_only，设置执行超时、最大返回行数和表白名单。</p></article><article><span>04 / EVIDENCE</span><h3>校验与审计</h3><p>核对执行状态、行列一致性与数值有效性，记录 SQL 指纹、耗时、策略结果和错误信息。</p></article></div><div className="blocked-example"><code>DELETE FROM account_balance WHERE user_id = ?;</code><strong>BLOCKED</strong><span>在数据库执行前被 SQL 治理层拒绝</span></div></section>;
}

function Deployment() {
  return <section className="page-section" id="deployment"><SectionHeading index="06" title="部署运行" description="GitHub Pages 承载可交互范例站；完整服务通过 Docker Compose 部署到支持 Docker 的 Linux 主机。" /><div className="deploy-layout"><ol><li><span>01</span><div><strong>准备配置</strong><p>复制 .env.example，设置域名、入口密钥、内部密钥与模型配置。</p></div></li><li><span>02</span><div><strong>启动服务</strong><p>Compose 构建 MindAgent、DataAgent、Redis 与 Caddy，内部服务不直接暴露端口。</p></div></li><li><span>03</span><div><strong>验证链路</strong><p>检查健康状态，再用带鉴权的 /chat 请求验证 MindAgent → DataAgent 调用。</p></div></li></ol><pre><code>{`cp .env.example .env
docker compose up -d --build
docker compose ps
./deploy/smoke-test.sh`}</code></pre></div><a className="document-link" href={`${REPOSITORY}/blob/main/docs/InsightFlow国内服务器上线指南.md`} target="_blank" rel="noreferrer">阅读国内服务器上线指南 <span>↗</span></a></section>;
}

function Resume() {
  return <section className="page-section resume" id="resume"><SectionHeading index="07" title="简历要点" description="面试时从业务问题、系统边界和关键取舍出发，现场用数据实验室证明链路。" /><div className="resume-grid"><div><span>PROJECT SUMMARY</span><h3>InsightFlow<br />企业知识与数据问答 Agent</h3><p>Java 21 · Spring Boot · Spring AI · Python · SQLite · Redis · React · Docker</p></div><ul><li>设计 MindAgent / DataAgent 分层架构，以统一对话入口编排知识问答、技术支持、账单账户与数据查询。</li><li>实现字段级 Schema 混合检索、SchemaGraph、CoT 查询规划、局部 Schema SQL 生成及有限自动纠错。</li><li>在执行层实现只读语句校验、表白名单、危险函数拦截、结果一致性校验与查询审计。</li><li>使用 Docker Compose、Caddy、Redis、健康检查和冒烟测试交付完整服务，并以 GitHub Pages 提供可运行范例。</li></ul></div><div className="resume-footer"><span>建议演示顺序</span><strong>架构 2 分钟 → 数据链路 4 分钟 → 安全与部署 2 分钟</strong><a href={REPOSITORY} target="_blank" rel="noreferrer">打开仓库 ↗</a></div></section>;
}

export default function App() {
  const [activeSection, setActiveSection] = useState("overview");
  useEffect(() => {
    const sections = NAV_ITEMS.map(([id]) => document.getElementById(id)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => { const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (visible) setActiveSection(visible.target.id); }, { rootMargin: "-15% 0px -65%", threshold: [0, 0.2, 0.6] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  return <div className="app-shell"><a className="skip-link" href="#main">跳到主要内容</a><Sidebar activeSection={activeSection} /><main id="main"><Overview /><Architecture /><Orchestration /><DataLab /><Security /><Deployment /><Resume /><footer>InsightFlow · 公开样例数据仅用于工程演示，不连接真实企业或银行数据库。</footer></main></div>;
}
