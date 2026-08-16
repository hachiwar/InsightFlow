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
  ["overview", "总览"],
  ["architecture", "系统架构"],
  ["orchestration", "Agent 编排"],
  ["data-lab", "数据实验室"],
  ["security", "安全治理"],
  ["deployment", "部署运行"],
];
const ROUTE_SCENARIOS = [
  { id: "general", label: "知识问答", question: "公司的退款政策和到账时间是什么？", intent: "GENERAL", target: "GeneralAgent", steps: ["读取会话记忆", "改写问题并检索知识库", "生成有依据的回答", "校验回答并写回记忆"] },
  { id: "technical", label: "技术支持", question: "支付回调连续超时，应该先检查什么？", intent: "TECHNICAL", target: "TechnicalAgent", steps: ["合并上下文与知识片段", "识别技术意图和紧急度", "生成分步排查建议", "判断是否升级人工"] },
  { id: "billing", label: "账单账户", question: "为什么本月账单比上月多了 380 元？", intent: "BILLING", target: "BillingAgent", steps: ["读取账户与会话上下文", "识别账单意图", "路由账单 Agent", "失败时降级通用回答"] },
  { id: "data", label: "数据分析", question: "近 6 个月收入增长但利润下降的月份，主要成本原因是什么？", intent: "DATA_QUERY", target: "DataAgent", steps: ["MindAgent 识别数据意图", "DataAgent 召回 Schema", "规划查询并生成 SQL", "治理、执行、校验与解释"] },
];
const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
let didAutoRun = false;

function SectionHeading({ title, description }) {
  return <header className="section-heading"><h2>{title}</h2>{description ? <p>{description}</p> : null}</header>;
}

function Sidebar({ activeSection }) {
  return <aside className="sidebar">
    <a className="brand" href="#overview" aria-label="InsightFlow 项目总览"><span className="brand-mark" aria-hidden="true">IF</span><strong>InsightFlow</strong></a>
    <nav aria-label="页面导航">{NAV_ITEMS.map(([id, label]) => <a className={activeSection === id ? "active" : ""} href={`#${id}`} key={id}>{label}</a>)}</nav>
    <div className="sidebar-meta"><a href={REPOSITORY} target="_blank" rel="noreferrer">GitHub 仓库 ↗</a><span>Java · Python · React</span></div>
  </aside>;
}

function Overview() {
  return <section className="page-section overview" id="overview">
    <header className="overview-intro"><h1>InsightFlow</h1><p>让企业知识问答与数据分析共用一个可信的 Agent 入口。</p><div className="hero-actions"><a className="primary-button" href="#data-lab">进入数据实验室</a><a className="text-link" href={REPOSITORY} target="_blank" rel="noreferrer">查看 GitHub ↗</a></div></header>
    <div className="overview-trace" aria-label="开放架构链路"><span>用户问题</span><b>→</b><span>MindAgent</span><b>→</b><span>意图路由</span><b>→</b><span>DataAgent</span><b>→</b><span>SQL 治理</span><b>→</b><span>结果解释</span></div>
    <div className="boundary-table"><div className="boundary-head"><span>项目边界与职责</span><strong>MindAgent · 对话编排</strong><strong>DataAgent · 数据查询</strong></div><div><span>核心职责</span><p>对话理解、上下文管理、知识检索、意图识别与路由。</p><p>Schema 召回、查询规划、SQL 生成、治理执行与解释。</p></div><div><span>输入</span><p>自然语言问题、历史对话、系统指令与工具状态。</p><p>结构化意图、业务约束、用户权限与数据库元数据。</p></div><div><span>输出</span><p>统一、可追踪的 Agent 响应与后续动作。</p><p>受治理的 SQL、结果集、校验状态与问题导向解释。</p></div><div><span>不负责</span><p>直接访问业务数据库或绕过数据安全策略。</p><p>维护会话记忆或编排跨领域 Agent。</p></div></div>
    <div className="evidence-strip"><span><b>浏览器内 SQLite</b>真实执行样例查询</span><span><b>只读 SQL</b>执行前策略校验</span><span><b>问题导向解释</b>对照问题与结果</span><span><b>Docker Compose</b>完整服务运行</span></div>
  </section>;
}

function Architecture() {
  return <section className="page-section" id="architecture">
    <SectionHeading title="系统架构" description="对话层负责理解与路由，数据层负责查询推理；两者通过稳定的 HTTP 契约协作。" />
    <div className="architecture-flow"><article className="flow-entry"><span>ENTRY</span><strong>用户 / 业务系统</strong><p>POST /chat</p></article><b aria-hidden="true">→</b><article><span>GATEWAY</span><strong>Caddy</strong><p>HTTPS · API Key</p></article><b aria-hidden="true">→</b><article className="flow-primary"><span>ORCHESTRATOR</span><strong>MindAgent</strong><p>Memory · RAG · Router</p></article><b aria-hidden="true">→</b><article><span>DATA TOOL</span><strong>DataAgent</strong><p>Text2SQL · Audit</p></article></div>
    <div className="architecture-details"><article><span>对话上下文</span><h3>工作记忆 + 情节记忆</h3><p>Redis 保存近期消息与 TTL，历史摘要按当前问题检索；回答完成后更新会话与用户画像。</p></article><article><span>知识检索</span><h3>改写 + 并行召回 + Rerank</h3><p>查询改写后并行调用知识工具，通过缓存、超时和熔断控制外部依赖。</p></article><article><span>结构化数据</span><h3>SchemaGraph + CoT 规划</h3><p>从字段级元数据构建局部 Schema，生成数据库、输入、输出与依赖明确的查询步骤。</p></article></div>
  </section>;
}

function Orchestration() {
  const [scenarioId, setScenarioId] = useState("data");
  const scenario = ROUTE_SCENARIOS.find((item) => item.id === scenarioId);
  return <section className="page-section" id="orchestration">
    <SectionHeading title="Agent 编排" description="同一个入口根据意图、上下文与服务状态选择执行链，数据问题会跨服务进入 DataAgent。" />
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
    <SectionHeading title="数据实验室" description="样例数据库在浏览器内执行；问题、规划、SQL、结果和解释都可检查。你也可以临时接入 OpenAI Chat Completions 兼容模型。" />
    <div className="stage-line" aria-label="执行阶段">{STAGES.map((stage, index) => { const number = index + 1; const state = number < activeStage ? "done" : number === activeStage ? "active" : ""; return <div className={state} key={stage}><span>{number < activeStage ? "✓" : number}</span><small>{stage}</small></div>; })}</div>
    {error ? <div className="error-banner" role="alert"><strong>分析失败</strong><span>{error}</span></div> : null}
    <div className="lab-grid">
      <aside className="question-column"><div className="column-title"><span>QUERY</span><small>数据截至 {SNAPSHOT_DATE}</small></div><label htmlFor="question">业务问题</label><textarea id="question" value={question} maxLength="500" onChange={(event) => setQuestion(event.target.value)} /><div className="question-list">{SAMPLE_QUESTIONS.map((item, index) => <button type="button" onClick={() => setQuestion(item)} key={item}><span>0{index + 1}</span>{item}</button>)}</div><button className="run-button" type="button" disabled={!database || running || !question.trim()} onClick={() => analyze()}>{running ? "正在推理…" : database ? "运行完整链路" : "正在加载样例库…"}</button>
        <details className="model-settings"><summary><span>自定义大模型</span><span className="model-summary-action"><b aria-hidden="true">＋</b> OpenAI 兼容接口</span></summary><label className="check-row"><input type="checkbox" checked={modelEnabled} onChange={(event) => setModelEnabled(event.target.checked)} />启用动态 SQL 与结果解释</label><label>服务商<select value={providerId} onChange={chooseProvider}>{MODEL_PROVIDERS.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></label><label>Chat Completions 地址<input type="url" autoComplete="off" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://example.com/v1/chat/completions" /></label><label>模型名称<input value={model} autoComplete="off" onChange={(event) => setModel(event.target.value)} /></label><label>临时 API Key<input type="password" value={apiKey} autoComplete="off" onChange={(event) => setApiKey(event.target.value)} /></label><p>Key 仅保存在页面内存。启用后问题、相关 Schema、SQL 与结果会发送到你填写的端点；请使用临时限额 Key。</p></details>
      </aside>
      <div className="trace-column"><div className="trace-summary"><article><span>KEYWORDS</span><div className="token-list">{previewKeywords.map((word) => <code key={word}>{word}</code>)}</div></article><article><span>SCHEMA RECALL</span><div className="token-list">{pipeline?.tables?.map((table) => <code key={table.name}>{table.name}</code>) ?? <small>运行后显示召回表</small>}</div></article></div><article className="plan-panel"><div className="column-title"><span>QUERY PLAN</span>{pipeline ? <small>{pipeline.repaired ? "自动纠错" : pipeline.mode === "model" ? "模型生成" : "本地可复现"}</small> : null}</div><h3>{pipeline?.title ?? "等待业务问题进入规划器"}</h3>{pipeline ? <ol>{pipeline.plan.map((step) => <li key={step}>{step}</li>)}</ol> : <p>运行后展示时间窗口、聚合口径、表连接和输出字段。</p>}</article><article className="sql-panel"><div className="column-title"><span>GENERATED SQL</span><div><button type="button" onClick={() => navigator.clipboard.writeText(sql)} disabled={!sql}>复制</button><button type="button" onClick={rerunSql} disabled={!sql || running}>重新执行</button></div></div><textarea aria-label="生成的 SQL，可编辑" spellCheck="false" value={sql} onChange={(event) => setSql(event.target.value)} placeholder="生成的只读 SQL 将显示在这里" /><p className="safety-note"><b>READ ONLY</b> 单条 SELECT / WITH · 写操作拦截 · 最多纠错 2 次</p></article></div>
      <aside className="data-column"><section><div className="column-title"><span>DEMO SCHEMA</span><small>{database ? "SQLite 已就绪" : "加载中"}</small></div><SchemaBrowser selectedNames={selectedNames} /></section><section className="result-section"><div className="column-title"><span>RESULT</span><small>{result ? `${result.rowCount} 行` : "等待执行"}</small></div><ResultTable result={result} />{explanation ? <div className="explanation"><span>{explanation.mode}</span><p>{explanation.text}</p></div> : null}</section></aside>
    </div>
  </section>;
}

function Security() {
  return <section className="page-section" id="security"><SectionHeading title="安全治理" description="把模型输出视为不可信输入；校验、数据库权限和审计在执行层统一生效。" /><div className="security-grid"><article><span>输入边界</span><h3>解析与单语句</h3><p>拒绝多语句拼接、注释注入与不完整语法，模型输出必须先经过解析。</p></article><article><span>执行策略</span><h3>只读白名单</h3><p>仅接受单条 SELECT / WITH，拦截 INSERT、UPDATE、DELETE、DDL 与管理指令。</p></article><article><span>数据边界</span><h3>表与函数边界</h3><p>仅允许当前 Schema 中的授权对象，并拒绝文件、扩展和高风险函数。</p></article><article><span>证据留存</span><h3>结果与审计</h3><p>核对行列与数值一致性，记录 SQL 指纹、耗时、策略结果和错误信息。</p></article></div><div className="blocked-example"><code>DROP TABLE accounts;</code><strong>已拒绝</strong><span>在数据库执行前被 SQL 治理层拦截</span></div></section>;
}

function Deployment() {
  return <section className="page-section" id="deployment"><SectionHeading title="部署运行" description="GitHub Pages 承载可交互范例站；完整服务通过 Docker Compose 部署到支持 Docker 的 Linux 主机。" /><div className="deploy-layout"><ol><li><span>01</span><div><strong>准备配置</strong><p>复制 .env.example，设置域名、入口密钥、内部密钥与模型配置。</p></div></li><li><span>02</span><div><strong>启动服务</strong><p>Compose 构建 MindAgent、DataAgent、Redis 与 Caddy，内部服务不直接暴露端口。</p></div></li><li><span>03</span><div><strong>验证链路</strong><p>检查健康状态，再用带鉴权的 /chat 请求验证 MindAgent → DataAgent 调用。</p></div></li></ol><pre><code>{`cp .env.example .env
docker compose up -d --build
docker compose ps
./deploy/smoke-test.sh`}</code></pre></div><a className="document-link" href={`${REPOSITORY}/blob/main/docs/InsightFlow国内服务器上线指南.md`} target="_blank" rel="noreferrer">阅读国内服务器上线指南 <span>↗</span></a></section>;
}

export default function App() {
  const [activeSection, setActiveSection] = useState("overview");
  useEffect(() => {
    const sections = NAV_ITEMS.map(([id]) => document.getElementById(id)).filter(Boolean);
    const syncActiveSection = () => { const marker = window.innerHeight * .28; const current = sections.filter((section) => section.getBoundingClientRect().top <= marker).at(-1) ?? sections[0]; setActiveSection(current.id); };
    syncActiveSection();
    window.addEventListener("scroll", syncActiveSection, { passive: true });
    return () => window.removeEventListener("scroll", syncActiveSection);
  }, []);
  return <div className="app-shell"><a className="skip-link" href="#main">跳到主要内容</a><Sidebar activeSection={activeSection} /><main id="main"><Overview /><Architecture /><Orchestration /><DataLab /><Security /><Deployment /><footer>InsightFlow · 公开样例数据仅用于工程演示，不连接真实企业或银行数据库。</footer></main></div>;
}
