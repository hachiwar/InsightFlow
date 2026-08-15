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
const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
let didAutoRun = false;

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
      try {
        nextResult = executeReadonly(targetDatabase, nextPipeline.sql);
      } catch (executionError) {
        if (!modelEnabled) throw executionError;
        setActiveStage(3);
        const repaired = await requestModelRepair({ endpoint, apiKey, model, question: targetQuestion.trim(), tables: nextPipeline.tables, sql: nextPipeline.sql, error: executionError.message, signal: controller.signal });
        nextPipeline = { ...nextPipeline, ...repaired, repaired: true };
        setPipeline(nextPipeline);
        setActiveStage(4);
        setSql(nextPipeline.sql);
        setActiveStage(5);
        nextResult = executeReadonly(targetDatabase, nextPipeline.sql);
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
          <span><strong>InsightFlow</strong><small>数据推理实验室</small></span>
        </a>
        <div className="topbar-badges">
          <span className={modelEnabled ? "badge model" : "badge local"}>{modelEnabled ? "自定义模型模式" : "本地演示模式"}</span>
          <span className="badge private">样例数据仅在浏览器内</span>
        </div>
        <a className="github-link" href="https://github.com/hachiwar/InsightFlow" target="_blank" rel="noreferrer">查看 GitHub ↗</a>
      </header>

      <main className="workspace">
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
            <p className="compatibility-note"><strong>接入规范：</strong>服务需兼容 OpenAI Chat Completions、支持 JSON 输出，并允许来自本站的浏览器跨域请求（CORS）。预设值可以手动修改；SQL 执行错误会自动纠错一次。</p>
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
      <footer>这是公开样例数据与浏览器沙盒，不连接真实银行或企业数据库，也不构成经营决策建议。</footer>
    </div>
  );
}
