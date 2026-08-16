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

const STAGES = ["关键词识别", "Schema 召回", "查询规划", "SQL 生成", "只读执行", "结果解释"];
const ROUTE_SCENARIOS = [
  {
    id: "general",
    label: "知识问答",
    question: "公司的退款政策和到账时间是什么？",
    intent: "GENERAL",
    agent: "GeneralAgent",
    summary: "检索企业知识库，结合会话上下文生成有依据的客服回答。",
    steps: ["读取工作记忆与历史摘要", "改写问题并检索知识库", "生成回答并校验依据", "写回会话与用户画像"],
  },
  {
    id: "technical",
    label: "技术支持",
    question: "支付回调连续超时，应该先检查什么？",
    intent: "TECHNICAL",
    agent: "TechnicalAgent",
    summary: "识别技术故障和紧急程度，路由到技术 Agent，并保留升级人工条件。",
    steps: ["读取上下文与知识片段", "识别技术意图和紧急度", "生成分步排查建议", "校验回答并判断是否升级"],
  },
  {
    id: "billing",
    label: "账单账户",
    question: "为什么本月账单比上月多了 380 元？",
    intent: "BILLING",
    agent: "BillingAgent",
    summary: "处理账单、账户和退款类业务问题；服务失败时由编排器降级。",
    steps: ["合并会话与知识上下文", "识别账单意图", "路由账单 Agent", "失败时回退 GeneralAgent"],
  },
  {
    id: "data",
    label: "数据分析",
    question: "近 6 个月收入增长但利润下降的月份，主要成本原因是什么？",
    intent: "DATA_QUERY",
    agent: "DataAgent → AskData",
    summary: "跨服务完成 Schema 检索、规划、SQL 生成、只读执行和结果解释。",
    steps: ["DataAgent 调用 AskData /query", "关键词与向量混合召回", "SchemaGraph 与 CoT 四元组规划", "SQL 生成、只读执行与轨迹返回"],
  },
];

const CAPABILITY_GROUPS = [
  {
    title: "EchoMind · 统一对话层",
    description: "Java Spring Boot",
    items: ["/chat 统一 API 与鉴权", "会话记忆、摘要与用户画像", "意图识别与四类 Agent 路由", "知识库 RAG、回答校验与人工升级", "熔断、降级、监控和评测"],
  },
  {
    title: "AskData · 数据推理层",
    description: "Python Text2SQL",
    items: ["关键词、向量、RRF 与可降级 Rerank", "字段级 Schema 检索与 SchemaGraph", "CoT 四元组查询规划", "局部 Schema 驱动 SQL 生成", "MCPRouter 只读执行与轨迹"],
  },
  {
    title: "部署 · 运行边界",
    description: "Docker Compose",
    items: ["Caddy 反向代理与 HTTPS", "公开 API 与内部服务独立密钥", "EchoMind、AskData、Redis 内网隔离", "只读容器与持久化数据卷", "健康检查与部署冒烟测试"],
  },
];

const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
let didAutoRun = false;

function ProjectShowcase() {
  const [scenarioId, setScenarioId] = useState("data");
  const scenario = ROUTE_SCENARIOS.find((item) => item.id === scenarioId);

  return (
    <section className="project-showcase" id="overview" aria-labelledby="showcase-title">
      <div className="showcase-hero">
        <div>
          <p className="section-kicker">EchoMind × AskData</p>
          <h1 id="showcase-title">一个入口，连接企业知识、业务 Agent 与数据分析</h1>
          <p>InsightFlow 用 EchoMind 负责会话、意图和 Agent 编排，用 AskData 负责结构化数据推理。下面先展示完整系统如何路由，再进入可真实执行的浏览器数据实验室。</p>
          <div className="hero-actions">
            <a className="primary-link" href="#data-lab">运行数据链路</a>
            <a className="secondary-link" href="#architecture">查看完整架构</a>
          </div>
        </div>
        <div className="scope-card" aria-label="本站运行范围">
          <strong>本站运行范围</strong>
          <dl>
            <div><dt>真实运行</dt><dd>SQLite、SQL 安全检查、查询结果</dd></div>
            <div><dt>可选运行</dt><dd>用户自带模型的 SQL 与结果解释</dd></div>
            <div><dt>架构展示</dt><dd>EchoMind、AskData、Redis、Caddy</dd></div>
          </dl>
          <p>GitHub Pages 是静态托管，不会在本站启动 Java/Python 后端。</p>
        </div>
      </div>

      <div className="router-demo" aria-labelledby="router-title">
        <div className="section-heading">
          <div><p className="section-kicker">统一入口演示</p><h2 id="router-title">同一个问题入口，按意图选择不同执行链</h2></div>
          <span className="demo-label">交互式架构演示</span>
        </div>
        <div className="scenario-tabs" role="tablist" aria-label="问题场景">
          {ROUTE_SCENARIOS.map((item) => (
            <button type="button" role="tab" aria-selected={item.id === scenarioId} className={item.id === scenarioId ? "active" : ""} onClick={() => setScenarioId(item.id)} key={item.id}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="route-workbench">
          <div className="route-question">
            <span>POST /chat</span>
            <blockquote>{scenario.question}</blockquote>
            <div><small>识别意图</small><strong>{scenario.intent}</strong></div>
            <div><small>目标 Agent</small><strong>{scenario.agent}</strong></div>
          </div>
          <ol className="route-steps">
            {scenario.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}
          </ol>
          <div className="route-outcome">
            <span>编排结果</span>
            <strong>{scenario.agent}</strong>
            <p>{scenario.summary}</p>
            {scenario.id === "data" ? <a href="#data-lab">进入下方真实数据实验室 ↓</a> : <small>本分支由仓库后端实现，Pages 仅展示调用流程。</small>}
          </div>
        </div>
      </div>

      <div className="architecture-showcase" id="architecture">
        <div className="section-heading">
          <div><p className="section-kicker">系统全景</p><h2>仓库中的三层职责与主调用链</h2></div>
          <a href="https://github.com/hachiwar/InsightFlow/blob/main/docs/architecture.md" target="_blank" rel="noreferrer">阅读架构文档 ↗</a>
        </div>
        <div className="system-flow" aria-label="完整系统调用链">
          <span>用户 / 业务系统</span><b>→</b><span>Caddy + API Key</span><b>→</b><span>EchoMind /chat</span><b>→</b><span>记忆 + RAG + 意图路由</span><b>→</b><span>专业 Agent</span><b>→</b><span>AskData（数据意图）</span>
        </div>
        <div className="capability-groups">
          {CAPABILITY_GROUPS.map((group) => (
            <article key={group.title}>
              <div><h3>{group.title}</h3><span>{group.description}</span></div>
              <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          ))}
        </div>
        <div className="memory-rag-strip">
          <div><span>工作记忆</span><strong>Redis 会话消息 + TTL</strong><small>保留最近对话，达到阈值后压缩</small></div>
          <div><span>情节记忆</span><strong>摘要检索 + 持久化</strong><small>按当前问题召回相关历史</small></div>
          <div><span>企业知识 RAG</span><strong>查询改写 + 并行召回 + Rerank</strong><small>熔断、缓存和降级路径可追踪</small></div>
          <div><span>回答治理</span><strong>依据校验 + 人工升级</strong><small>监控 Agent 成功率、延迟和告警</small></div>
        </div>
      </div>
    </section>
  );
}

function OperationsShowcase() {
  return (
    <section className="operations-showcase" id="operations" aria-labelledby="operations-title">
      <div className="section-heading">
        <div><p className="section-kicker">安全、降级与上线</p><h2 id="operations-title">从模型输出到数据库执行，关键边界均可复核</h2></div>
        <span className="demo-label">仓库实现状态</span>
      </div>
      <div className="operations-grid">
        <article><span className="operation-number">01</span><h3>入口隔离</h3><p>Caddy 只公开 80/443；EchoMind、AskData 和 Redis 仅在容器内部通信。公开 API 与内部调用使用不同密钥。</p></article>
        <article><span className="operation-number">02</span><h3>只读执行</h3><p>后端 SQLite 使用只读连接、查询模式、超时和 100 行上限。页面还会在执行前拒绝写操作和多语句。</p></article>
        <article><span className="operation-number">03</span><h3>失败降级</h3><p>知识工具包含超时、缓存与熔断；专业 Agent 失败时可降级到 GeneralAgent。页面模型解释失败时回退本地总结。</p></article>
        <article><span className="operation-number">04</span><h3>上线验证</h3><p>Compose 提供健康检查，Caddy 管理 HTTPS，并通过冒烟测试验证鉴权、服务状态和 EchoMind → AskData 数据链路。</p></article>
      </div>
      <div className="truth-table">
        <div><strong>本页已完整覆盖</strong><span>项目定位、统一入口、四类 Agent 路由、记忆、RAG、Text2SQL、安全、降级、监控评测与部署拓扑。</span></div>
        <div><strong>Pages 中真实执行</strong><span>样例 Schema、SQLite 查询、SQL 只读拦截、结果表格，以及可选的用户自带模型调用。</span></div>
        <div><strong>生产环境仍需补齐</strong><span>真实数据源白名单、表字段权限、SQL 审计、结果一致性校验、多数据库适配和专用评测集。</span></div>
      </div>
      <div className="operations-links">
        <a href="https://github.com/hachiwar/InsightFlow/blob/main/docs/status.md" target="_blank" rel="noreferrer">查看实现状态 ↗</a>
        <a href="https://github.com/hachiwar/InsightFlow/blob/main/docs/InsightFlow%E5%9B%BD%E5%86%85%E6%9C%8D%E5%8A%A1%E5%99%A8%E4%B8%8A%E7%BA%BF%E6%8C%87%E5%8D%97.md" target="_blank" rel="noreferrer">查看服务器上线指南 ↗</a>
      </div>
    </section>
  );
}

function ResultTable({ result }) {
  if (!result) return <div className="empty-state">运行一次分析后，这里会显示 SQLite 的真实查询结果。</div>;
  if (!result.rows.length) return <div className="empty-state">查询成功，没有匹配数据。</div>;

  return (
    <div className="table-wrap" tabIndex="0" aria-label="SQL 查询结果，可横向滚动">
      <table>
        <thead>
          <tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {result.columns.map((column) => {
                const value = row[column];
                const numeric = typeof value === "number";
                const negative = numeric && value < 0;
                return <td className={negative ? "negative" : numeric ? "numeric" : ""} key={column}>{numeric ? formatNumber(value) : String(value ?? "—")}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SchemaBrowser({ selectedNames }) {
  return (
    <div className="schema-list">
      {SCHEMA.map((table) => {
        const selected = selectedNames.has(table.name);
        return (
          <details className={selected ? "schema-table selected" : "schema-table"} key={table.name} open={selected}>
            <summary>
              <span><span className="table-glyph" aria-hidden="true">▦</span>{table.name}</span>
              <small>{table.label}</small>
            </summary>
            <div className="schema-columns">
              {table.columns.map(([name, type, note]) => (
                <div className="schema-column" key={name}>
                  <code>{name}</code><span>{type}</span><small>{note}</small>
                </div>
              ))}
            </div>
          </details>
        );
      })}
      <details className="relations">
        <summary>关系图谱 · {RELATIONS.length} 条</summary>
        {RELATIONS.map((relation) => <code key={relation}>{relation}</code>)}
      </details>
    </div>
  );
}

function AgentFlow() {
  return (
    <section className="agent-value" aria-labelledby="agent-value-title">
      <div>
        <p className="section-kicker">为什么不只是预存 SQL</p>
        <h2 id="agent-value-title">Agent 把模糊业务意图变成可审计执行链</h2>
      </div>
      <ol>
        <li><strong>理解口径</strong><span>识别“最近”“盈利”“未消费”等业务约束</span></li>
        <li><strong>选择数据</strong><span>从 5 张表召回字段，并补齐外键连接</span></li>
        <li><strong>动态规划</strong><span>把时间窗口、聚合、窗口函数组合成步骤</span></li>
        <li><strong>安全执行</strong><span>拦截写操作，保留 SQL、结果和解释供复核</span></li>
      </ol>
    </section>
  );
}

export default function App() {
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

  async function explainResult(nextPipeline, nextSql, nextResult, targetQuestion, signal) {
    const localText = summarizeResult(nextPipeline, nextResult);
    if (!modelEnabled) return { text: localText, mode: "local" };
    try {
      const text = await requestModelExplanation({ endpoint, apiKey, model, question: targetQuestion, sql: nextSql, result: nextResult, signal });
      return { text, mode: "model" };
    } catch {
      return { text: localText, mode: "fallback" };
    }
  }

  async function analyze(targetQuestion = question, targetDatabase = database) {
    if (!targetDatabase || running || !targetQuestion.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 90_000);
    setRunning(true);
    setError("");
    setExplanation(null);
    setResult(null);
    setActiveStage(1);
    try {
      if (!modelEnabled) await sleep(120);
      setActiveStage(2);
      let nextPipeline = await buildPipeline({
        question: targetQuestion.trim(),
        modelConfig: modelEnabled ? { enabled: true, endpoint, model, apiKey } : null,
        signal: controller.signal,
      });
      setPipeline(nextPipeline);
      setActiveStage(3);
      if (!modelEnabled) await sleep(120);
      setSql(nextPipeline.sql);
      setActiveStage(4);
      assertReadonlySql(nextPipeline.sql);
      if (!modelEnabled) await sleep(120);
      setActiveStage(5);
      let nextResult;
      for (let repairCount = 0; repairCount <= 2; repairCount += 1) {
        try {
          nextResult = executeReadonly(targetDatabase, nextPipeline.sql);
          break;
        } catch (executionError) {
          if (!modelEnabled || repairCount === 2) throw executionError;
          setActiveStage(3);
          const repaired = await requestModelRepair({ endpoint, apiKey, model, question: targetQuestion.trim(), tables: nextPipeline.tables, sql: nextPipeline.sql, error: executionError.message, signal: controller.signal });
          nextPipeline = { ...nextPipeline, ...repaired, repaired: true };
          setPipeline(nextPipeline);
          setActiveStage(4);
          setSql(nextPipeline.sql);
          setActiveStage(5);
        }
      }
      setResult(nextResult);
      setExplanation(await explainResult(nextPipeline, nextPipeline.sql, nextResult, targetQuestion.trim(), controller.signal));
      setActiveStage(6);
    } catch (caught) {
      if (timedOut) {
        setError("模型请求超过 90 秒，已停止等待。请检查端点状态后重试。");
      } else if (caught.name !== "AbortError") {
        const corsHint = caught instanceof TypeError ? "浏览器无法访问该端点，可能是网络或 CORS 限制。请使用允许浏览器跨域的兼容端点。" : caught.message;
        setError(corsHint);
      }
    } finally {
      window.clearTimeout(timeoutId);
      setRunning(false);
    }
  }

  async function rerunSql() {
    if (!database || !pipeline) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
    setRunning(true);
    setError("");
    setExplanation(null);
    try {
      setActiveStage(5);
      const nextResult = executeReadonly(database, sql);
      setResult(nextResult);
      setExplanation(await explainResult(pipeline, sql, nextResult, question.trim(), controller.signal));
      setActiveStage(6);
    } catch (caught) {
      setError(caught.message);
    } finally {
      window.clearTimeout(timeoutId);
      setRunning(false);
    }
  }

  useEffect(() => {
    let active = true;
    getDemoDatabase(initSqlJs, sqlWasmUrl)
      .then((nextDatabase) => {
        if (!active) return;
        setDatabase(nextDatabase);
        if (!didAutoRun) {
          didAutoRun = true;
          setTimeout(() => analyze(SAMPLE_QUESTIONS[0], nextDatabase), 0);
        }
      })
      .catch((caught) => active && setError(`样例数据库初始化失败：${caught.message}`));
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  async function copySql() {
    try {
      await navigator.clipboard.writeText(sql);
    } catch {
      setError("浏览器未授予剪贴板权限，请手动选择 SQL 复制。");
    }
  }

  function chooseProvider(event) {
    const provider = MODEL_PROVIDERS.find((item) => item.id === event.target.value);
    setProviderId(provider.id);
    if (!provider.endpoint) return;
    setEndpoint(provider.endpoint);
    setModel(provider.model);
    setModelEnabled(true);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="./" aria-label="InsightFlow 首页">
          <span className="brand-mark" aria-hidden="true">IF</span>
          <span><strong>InsightFlow</strong><small>企业知识与数据问答 Agent</small></span>
        </a>
        <nav className="topbar-nav" aria-label="页面导航"><a href="#overview">项目总览</a><a href="#data-lab">数据实验室</a><a href="#operations">安全与上线</a></nav>
        <a className="github-link" href="https://github.com/hachiwar/InsightFlow" target="_blank" rel="noreferrer">查看 GitHub ↗</a>
      </header>

      <ProjectShowcase />

      <section className="lab-intro" id="data-lab" aria-labelledby="lab-title">
        <div><p className="section-kicker">真实可运行范例</p><h2 id="lab-title">AskData 数据推理实验室</h2></div>
        <p>选择复杂业务问题，查看从关键词识别、Schema 召回、查询规划、SQL 生成到实际数据与问题导向解释的完整链路。</p>
        <div className="topbar-badges">
          <span className={modelEnabled ? "badge model" : "badge local"}>{modelEnabled ? "自定义模型模式" : "本地演示模式"}</span>
          <span className="badge private">样例数据仅在浏览器内</span>
        </div>
      </section>

      <main className="workspace" aria-label="AskData 数据推理实验室">
        <aside className="query-panel" aria-labelledby="query-title">
          <div className="panel-heading">
            <div><p className="section-kicker">自然语言入口</p><h1 id="query-title">提出业务问题</h1></div>
            <span className="snapshot">数据截至 {SNAPSHOT_DATE}</span>
          </div>
          <label className="sr-only" htmlFor="question">业务问题</label>
          <textarea id="question" value={question} maxLength="500" onChange={(event) => setQuestion(event.target.value)} />
          <div className="character-count">{question.length} / 500</div>

          <div className="examples">
            <span>复杂范例</span>
            {SAMPLE_QUESTIONS.map((item, index) => (
              <button key={item} type="button" onClick={() => setQuestion(item)}>
                <b>0{index + 1}</b><span>{item}</span>
              </button>
            ))}
          </div>

          <button className="run-button" type="button" disabled={!database || running || !question.trim()} onClick={() => analyze()}>
            {running ? "正在推理…" : database ? "开始分析" : "正在加载样例库…"}
          </button>

          <details className="model-settings">
            <summary><span>连接自定义模型</span><small>OpenAI 兼容接口</small></summary>
            <label className="toggle-row">
              <input type="checkbox" checked={modelEnabled} onChange={(event) => setModelEnabled(event.target.checked)} />
              <span>使用模型动态生成 SQL</span>
            </label>
            <label>模型服务商
              <select value={providerId} onChange={chooseProvider}>
                {MODEL_PROVIDERS.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}
              </select>
            </label>
            <label>Chat Completions API 地址
              <input type="url" autoComplete="off" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://example.com/v1/chat/completions" />
            </label>
            <label>模型名称
              <input value={model} autoComplete="off" onChange={(event) => setModel(event.target.value)} placeholder="模型服务商提供的名称" />
            </label>
            <label>临时 API Key
              <input type="password" value={apiKey} autoComplete="off" onChange={(event) => setApiKey(event.target.value)} placeholder="刷新页面后自动清除" />
            </label>
            <p className="compatibility-note"><strong>接入规范：</strong>服务需兼容 OpenAI Chat Completions、支持 JSON 输出，并允许来自本站的浏览器跨域请求（CORS）。预设值可以手动修改；SQL 执行错误最多自动纠错 2 次。</p>
            <p className="privacy-note"><strong>安全提示：</strong>Key 仅保存在当前页面内存；启用模型后，业务问题、相关 Schema、SQL 和查询结果会直接发送到所填端点。请只使用临时、限额 Key，不要提交敏感数据。</p>
          </details>
        </aside>

        <section className="reasoning-panel" aria-label="Agent 执行链路">
          <nav className="stage-nav" aria-label="执行阶段">
            {STAGES.map((stage, index) => {
              const number = index + 1;
              const state = number < activeStage ? "done" : number === activeStage ? "active" : "pending";
              return <div className={`stage ${state}`} key={stage}><span>{number < activeStage ? "✓" : number}</span><small>{stage}</small></div>;
            })}
          </nav>

          {error ? <div className="error-banner" role="alert"><strong>未完成本次分析</strong><span>{error}</span></div> : null}

          <section className="trace-block trace-overview">
            <div>
              <p className="section-kicker">步骤 1 · 语义线索</p>
              <h2>识别关键词</h2>
              <div className="chips">{previewKeywords.length ? previewKeywords.map((word) => <span key={word}>{word}</span>) : <em>等待问题输入</em>}</div>
            </div>
            <div>
              <p className="section-kicker">步骤 2 · 最小 Schema</p>
              <h2>已选择 {pipeline?.tables?.length ?? 0} 张表</h2>
              <div className="table-tags">{pipeline?.tables?.map((table) => <code key={table.name}>{table.name}</code>) ?? <em>等待召回</em>}</div>
            </div>
          </section>

          <section className="trace-block plan-block">
            <div className="block-title">
              <div><p className="section-kicker">步骤 3 · 查询规划</p><h2>{pipeline?.title ?? "等待生成计划"}</h2></div>
              {pipeline ? <span className={`mode-pill ${pipeline.mode}`}>{pipeline.repaired ? "模型自动纠错" : pipeline.mode === "model" ? "模型动态生成" : "已验证范例"}</span> : null}
            </div>
            {pipeline ? <ol>{pipeline.plan.map((step) => <li key={step}>{step}</li>)}</ol> : <div className="placeholder-lines" aria-hidden="true"><i /><i /><i /></div>}
          </section>

          <section className="sql-block">
            <div className="block-title sql-title">
              <div><p className="section-kicker">步骤 4 · 生成 SQL</p><h2>SQLite · 只读</h2></div>
              <div className="sql-actions"><button type="button" onClick={copySql} disabled={!sql}>复制</button><button type="button" onClick={rerunSql} disabled={!sql || running}>执行编辑后的 SQL</button></div>
            </div>
            <textarea className="sql-editor" aria-label="生成的 SQL，可编辑" spellCheck="false" value={sql} onChange={(event) => setSql(event.target.value)} placeholder="生成的 SQL 将显示在这里" />
            <div className="safety-bar"><span aria-hidden="true">✓</span><strong>只读安全检查</strong><small>仅允许单条 SELECT / WITH，写操作与结构变更会在执行前拦截</small></div>
          </section>
        </section>

        <aside className="data-panel" aria-label="样例数据库与执行结果">
          <section className="schema-panel">
            <div className="block-title"><div><p className="section-kicker">浏览器内 SQLite</p><h2>样例数据库</h2></div><span className="db-ready">{database ? "● 已就绪" : "○ 加载中"}</span></div>
            <SchemaBrowser selectedNames={selectedNames} />
          </section>
          <section className="result-panel">
            <div className="block-title"><div><p className="section-kicker">步骤 5 · 真实执行</p><h2>执行结果</h2></div>{result ? <span className="row-count">{result.rowCount} 行</span> : null}</div>
            <ResultTable result={result} />
            {explanation ? <div className="explanation"><span>步骤 6 · 结果解释 · {explanation.mode === "model" ? "模型生成" : explanation.mode === "fallback" ? "本地降级" : "本地总结"}</span><p>{explanation.text}</p></div> : null}
          </section>
        </aside>
      </main>
      <AgentFlow />
      <OperationsShowcase />
      <footer>这是公开样例数据与浏览器沙盒，不连接真实银行或企业数据库，也不构成经营决策建议。</footer>
    </div>
  );
}
