export const SCHEMA = [
  {
    name: "customers",
    label: "客户主数据",
    aliases: ["客户", "用户", "企业", "地区", "客户分层"],
    columns: [
      ["customer_id", "INTEGER", "PK"],
      ["customer_name", "TEXT", "客户名称"],
      ["segment", "TEXT", "客户分层"],
      ["region", "TEXT", "所属地区"],
      ["registered_at", "DATE", "注册日期"],
    ],
  },
  {
    name: "accounts",
    label: "银行账户",
    aliases: ["账户", "银行", "存款", "余额", "活期", "定期"],
    columns: [
      ["account_id", "INTEGER", "PK"],
      ["customer_id", "INTEGER", "FK → customers"],
      ["account_type", "TEXT", "账户类型"],
      ["balance", "NUMERIC", "账户余额"],
      ["opened_at", "DATE", "开户日期"],
    ],
  },
  {
    name: "orders",
    label: "业务订单",
    aliases: ["订单", "消费", "收入", "营收", "渠道", "业务", "月份"],
    columns: [
      ["order_id", "INTEGER", "PK"],
      ["customer_id", "INTEGER", "FK → customers"],
      ["order_date", "DATE", "订单日期"],
      ["channel", "TEXT", "销售渠道"],
      ["revenue", "NUMERIC", "确认收入"],
      ["status", "TEXT", "订单状态"],
    ],
  },
  {
    name: "order_costs",
    label: "订单成本明细",
    aliases: ["成本", "利润", "盈利", "亏损", "物流", "营销", "退款"],
    columns: [
      ["cost_id", "INTEGER", "PK"],
      ["order_id", "INTEGER", "FK → orders"],
      ["product_cost", "NUMERIC", "产品成本"],
      ["logistics_cost", "NUMERIC", "物流成本"],
      ["marketing_cost", "NUMERIC", "营销成本"],
      ["refund_cost", "NUMERIC", "退款成本"],
    ],
  },
  {
    name: "monthly_targets",
    label: "月度经营目标",
    aliases: ["目标", "达成", "预算", "月份", "地区"],
    columns: [
      ["month", "TEXT", "月份，YYYY-MM"],
      ["region", "TEXT", "地区"],
      ["revenue_target", "NUMERIC", "收入目标"],
      ["profit_target", "NUMERIC", "利润目标"],
    ],
  },
];

export const RELATIONS = [
  "customers.customer_id → accounts.customer_id",
  "customers.customer_id → orders.customer_id",
  "orders.order_id → order_costs.order_id",
  "customers.region + 月份 → monthly_targets",
];

export const SAMPLE_QUESTIONS = [
  "查询最近 3 个月各地区的收入、总成本、利润和利润率，并找出连续亏损的地区",
  "哪些企业客户有银行存款，但最近 90 天没有任何成功订单？列出存款余额和最后消费日期",
  "最近 6 个月中，哪些月份收入增长但利润反而下滑？按成本项解释原因",
];

export const SNAPSHOT_DATE = "2026-07-31";

const INIT_SQL = `
PRAGMA foreign_keys = ON;
CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL,
  segment TEXT NOT NULL,
  region TEXT NOT NULL,
  registered_at TEXT NOT NULL
);
CREATE TABLE accounts (
  account_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
  account_type TEXT NOT NULL,
  balance REAL NOT NULL CHECK (balance >= 0),
  opened_at TEXT NOT NULL
);
CREATE TABLE orders (
  order_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
  order_date TEXT NOT NULL,
  channel TEXT NOT NULL,
  revenue REAL NOT NULL CHECK (revenue >= 0),
  status TEXT NOT NULL CHECK (status IN ('completed', 'refunded', 'cancelled'))
);
CREATE TABLE order_costs (
  cost_id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(order_id),
  product_cost REAL NOT NULL,
  logistics_cost REAL NOT NULL,
  marketing_cost REAL NOT NULL,
  refund_cost REAL NOT NULL
);
CREATE TABLE monthly_targets (
  month TEXT NOT NULL,
  region TEXT NOT NULL,
  revenue_target REAL NOT NULL,
  profit_target REAL NOT NULL,
  PRIMARY KEY (month, region)
);

INSERT INTO customers VALUES
  (1, '星河零售', '战略客户', '华东', '2024-01-18'),
  (2, '北辰制造', '企业客户', '华北', '2024-03-09'),
  (3, '南湾科技', '成长客户', '华南', '2024-06-21'),
  (4, '云岭商贸', '企业客户', '西南', '2024-08-12'),
  (5, '远山实业', '企业客户', '华中', '2023-11-02'),
  (6, '海港物流', '战略客户', '华东', '2023-09-15'),
  (7, '新芽工作室', '小微客户', '华南', '2025-02-11'),
  (8, '长风服务', '成长客户', '华北', '2025-01-07');

INSERT INTO accounts VALUES
  (101, 1, '活期存款', 860000, '2024-01-20'),
  (102, 1, '定期存款', 1200000, '2024-07-01'),
  (103, 2, '活期存款', 420000, '2024-03-10'),
  (104, 3, '活期存款', 180000, '2024-06-23'),
  (105, 4, '定期存款', 760000, '2024-08-15'),
  (106, 5, '活期存款', 930000, '2023-11-05'),
  (107, 5, '定期存款', 1500000, '2024-02-01'),
  (108, 6, '定期存款', 3100000, '2023-09-18'),
  (109, 7, '电子钱包', 26000, '2025-02-12'),
  (110, 8, '活期存款', 350000, '2025-01-09');

INSERT INTO orders VALUES
  (201, 1, '2026-02-14', '直营', 100000, 'completed'),
  (202, 2, '2026-02-18', '渠道', 90000, 'completed'),
  (203, 3, '2026-02-22', '线上', 80000, 'completed'),
  (204, 4, '2026-02-26', '渠道', 70000, 'completed'),
  (205, 1, '2026-03-12', '直营', 115000, 'completed'),
  (206, 2, '2026-03-18', '渠道', 100000, 'completed'),
  (207, 3, '2026-03-21', '线上', 90000, 'completed'),
  (208, 4, '2026-03-25', '渠道', 75000, 'completed'),
  (209, 1, '2026-04-11', '直营', 130000, 'completed'),
  (210, 2, '2026-04-16', '渠道', 110000, 'completed'),
  (211, 3, '2026-04-20', '线上', 100000, 'completed'),
  (212, 4, '2026-04-24', '渠道', 90000, 'completed'),
  (213, 1, '2026-05-08', '直营', 500000, 'completed'),
  (214, 2, '2026-05-14', '渠道', 400000, 'completed'),
  (215, 3, '2026-05-19', '线上', 350000, 'completed'),
  (216, 4, '2026-05-25', '渠道', 300000, 'completed'),
  (217, 1, '2026-06-07', '直营', 550000, 'completed'),
  (218, 2, '2026-06-15', '渠道', 420000, 'completed'),
  (219, 3, '2026-06-20', '线上', 390000, 'completed'),
  (220, 4, '2026-06-27', '渠道', 330000, 'completed'),
  (221, 1, '2026-07-06', '直营', 620000, 'completed'),
  (222, 2, '2026-07-13', '渠道', 410000, 'completed'),
  (223, 3, '2026-07-20', '线上', 380000, 'completed'),
  (224, 4, '2026-07-29', '渠道', 360000, 'completed'),
  (225, 5, '2026-02-01', '渠道', 68000, 'completed'),
  (226, 6, '2026-03-03', '直营', 210000, 'completed'),
  (227, 7, '2026-07-31', '线上', 12000, 'refunded'),
  (228, 8, '2026-07-18', '线上', 45000, 'completed');

INSERT INTO order_costs VALUES
  (301,201,61000,9000,8000,2000), (302,202,57000,9000,10000,4000),
  (303,203,48000,8000,9000,3000), (304,204,43000,7000,8000,2000),
  (305,205,68000,9000,9000,2000), (306,206,62000,10000,11000,2000),
  (307,207,54000,9000,9000,3000), (308,208,46000,8000,9000,2000),
  (309,209,79000,11000,12000,3000), (310,210,70000,11000,12000,3000),
  (311,211,63000,10000,11000,3000), (312,212,57000,9000,10000,3000),
  (313,213,300000,35000,35000,10000), (314,214,330000,45000,55000,30000),
  (315,215,235000,26000,29000,10000), (316,216,245000,30000,50000,15000),
  (317,217,325000,38000,37000,10000), (318,218,345000,48000,62000,35000),
  (319,219,255000,28000,32000,15000), (320,220,230000,26000,54000,10000),
  (321,221,350000,43000,47000,10000), (322,222,352000,51000,67000,30000),
  (323,223,275000,31000,39000,75000), (324,224,240000,29000,58000,3000),
  (325,225,41000,7000,8000,2000), (326,226,128000,14000,16000,2000),
  (327,227,8000,1200,1800,12000), (328,228,27000,4000,5000,1000);

INSERT INTO monthly_targets VALUES
  ('2026-05','华东',520000,90000), ('2026-05','华北',430000,40000),
  ('2026-05','华南',360000,45000), ('2026-05','西南',320000,30000),
  ('2026-06','华东',560000,100000), ('2026-06','华北',450000,45000),
  ('2026-06','华南',400000,50000), ('2026-06','西南',340000,35000),
  ('2026-07','华东',600000,110000), ('2026-07','华北',460000,50000),
  ('2026-07','华南',420000,55000), ('2026-07','西南',370000,40000);
`;

const PROFIT_SQL = `WITH data_anchor AS (
  SELECT date(MAX(order_date), 'start of month') AS latest_month
  FROM orders
), monthly_region AS (
  SELECT
    substr(o.order_date, 1, 7) AS month,
    c.region,
    SUM(o.revenue) AS revenue,
    SUM(oc.product_cost + oc.logistics_cost + oc.marketing_cost + oc.refund_cost) AS total_cost,
    SUM(o.revenue - oc.product_cost - oc.logistics_cost - oc.marketing_cost - oc.refund_cost) AS profit
  FROM orders o
  JOIN customers c ON c.customer_id = o.customer_id
  JOIN order_costs oc ON oc.order_id = o.order_id
  CROSS JOIN data_anchor a
  WHERE o.status = 'completed'
    AND date(o.order_date) >= date(a.latest_month, '-2 months')
  GROUP BY month, c.region
), region_summary AS (
  SELECT
    region,
    ROUND(SUM(revenue), 2) AS revenue,
    ROUND(SUM(total_cost), 2) AS total_cost,
    ROUND(SUM(profit), 2) AS profit,
    ROUND(SUM(profit) * 100.0 / NULLIF(SUM(revenue), 0), 2) AS profit_margin,
    SUM(CASE WHEN profit < 0 THEN 1 ELSE 0 END) AS loss_months
  FROM monthly_region
  GROUP BY region
)
SELECT region, revenue, total_cost, profit, profit_margin,
  CASE WHEN loss_months = 3 THEN '连续3个月亏损' ELSE '非连续亏损' END AS risk_signal
FROM region_summary
ORDER BY profit ASC;`;

const DEPOSIT_SQL = `WITH data_anchor AS (
  SELECT date(MAX(order_date)) AS snapshot_date FROM orders
), deposits AS (
  SELECT customer_id, ROUND(SUM(balance), 2) AS deposit_balance
  FROM accounts
  WHERE account_type IN ('活期存款', '定期存款')
  GROUP BY customer_id
), last_purchase AS (
  SELECT customer_id, MAX(order_date) AS last_order_date
  FROM orders
  WHERE status = 'completed'
  GROUP BY customer_id
)
SELECT c.customer_name, c.segment, c.region, d.deposit_balance,
  lp.last_order_date,
  CAST(julianday(a.snapshot_date) - julianday(lp.last_order_date) AS INTEGER) AS inactive_days
FROM customers c
JOIN deposits d ON d.customer_id = c.customer_id
LEFT JOIN last_purchase lp ON lp.customer_id = c.customer_id
CROSS JOIN data_anchor a
WHERE d.deposit_balance > 0
  AND (lp.last_order_date IS NULL OR date(lp.last_order_date) < date(a.snapshot_date, '-90 days'))
ORDER BY d.deposit_balance DESC;`;

const TREND_SQL = `WITH monthly AS (
  SELECT
    substr(o.order_date, 1, 7) AS month,
    SUM(o.revenue) AS revenue,
    SUM(oc.product_cost) AS product_cost,
    SUM(oc.logistics_cost) AS logistics_cost,
    SUM(oc.marketing_cost) AS marketing_cost,
    SUM(oc.refund_cost) AS refund_cost,
    SUM(o.revenue - oc.product_cost - oc.logistics_cost - oc.marketing_cost - oc.refund_cost) AS profit
  FROM orders o
  JOIN order_costs oc ON oc.order_id = o.order_id
  WHERE o.status = 'completed'
    AND o.order_date >= date((SELECT MAX(order_date) FROM orders), '-5 months', 'start of month')
  GROUP BY month
), compared AS (
  SELECT *,
    LAG(revenue) OVER (ORDER BY month) AS previous_revenue,
    LAG(profit) OVER (ORDER BY month) AS previous_profit
  FROM monthly
)
SELECT month, ROUND(revenue, 2) AS revenue, ROUND(profit, 2) AS profit,
  ROUND(revenue - previous_revenue, 2) AS revenue_change,
  ROUND(profit - previous_profit, 2) AS profit_change,
  ROUND(logistics_cost, 2) AS logistics_cost,
  ROUND(marketing_cost, 2) AS marketing_cost,
  ROUND(refund_cost, 2) AS refund_cost
FROM compared
WHERE revenue > previous_revenue AND profit < previous_profit
ORDER BY month;`;

const SCENARIOS = [
  {
    id: "profitability",
    title: "区域盈利与连续亏损诊断",
    terms: ["利润", "利润率", "盈利", "亏损", "成本", "地区", "几个月", "3个月", "最近"],
    tables: ["customers", "orders", "order_costs"],
    plan: [
      "以样例库最新订单日为数据锚点，确定最近 3 个完整数据月份",
      "通过 customer_id 和 order_id 连接客户、订单与四类成本明细",
      "先计算地区月度利润，再汇总收入、总成本和利润率",
      "统计负利润月份，标记连续 3 个月亏损的地区",
    ],
    sql: PROFIT_SQL,
  },
  {
    id: "inactive-deposits",
    title: "有存款但长期未消费客户识别",
    terms: ["银行", "存款", "余额", "账户", "客户", "用户", "90天", "没有", "消费", "订单"],
    tables: ["customers", "accounts", "orders"],
    plan: [
      "汇总每位客户的活期与定期存款余额，排除电子钱包",
      "从成功订单中计算客户最后一次消费日期",
      "以样例库最新订单日为数据锚点，判断是否超过 90 天未消费",
      "保留有存款且长期未消费的客户，并按存款余额降序排列",
    ],
    sql: DEPOSIT_SQL,
  },
  {
    id: "profit-trend",
    title: "收入增长但利润下滑归因",
    terms: ["6个月", "最近", "月份", "收入", "增长", "利润", "下滑", "成本", "原因", "趋势"],
    tables: ["orders", "order_costs"],
    plan: [
      "按月份聚合成功订单收入和产品、物流、营销、退款四类成本",
      "使用窗口函数取得上月收入和利润，避免应用层逐月拼接",
      "筛选收入环比增长但利润环比下降的反常月份",
      "返回成本分项，帮助定位利润恶化的主要来源",
    ],
    sql: TREND_SQL,
  },
];

const KEYWORD_LEXICON = [...new Set(SCENARIOS.flatMap((item) => item.terms))];
const WRITE_KEYWORDS = /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|reindex|replace|truncate)\b/i;

let databasePromise;

export function getDemoDatabase(initSqlJs, wasmUrl) {
  if (!databasePromise) {
    databasePromise = initSqlJs({ locateFile: () => wasmUrl }).then((SQL) => {
      const database = new SQL.Database();
      database.run(INIT_SQL);
      return database;
    });
  }
  return databasePromise;
}

export function extractKeywords(question) {
  const compact = question.replace(/\s+/g, "");
  const matched = KEYWORD_LEXICON.filter((keyword) => compact.includes(keyword.replace(/\s+/g, "")));
  const timeExpressions = question.match(/(?:最近)?\s*\d+\s*(?:天|个月|月|季度|年)/g) ?? [];
  return [...new Set([...timeExpressions.map((item) => item.replace(/\s+/g, "")), ...matched])].slice(0, 12);
}

export function retrieveSchema(question, keywords = extractKeywords(question)) {
  const haystack = `${question} ${keywords.join(" ")}`.toLowerCase();
  const ranked = SCHEMA.map((table) => {
    const terms = [table.name, table.label, ...table.aliases, ...table.columns.flatMap((column) => column)];
    const score = terms.reduce((total, term) => total + (haystack.includes(String(term).toLowerCase()) ? 1 : 0), 0);
    return { ...table, score };
  }).sort((a, b) => b.score - a.score);
  const selected = ranked.filter((table) => table.score > 0).slice(0, 4);
  return selected.length ? selected : ranked.slice(0, 3);
}

export function assertReadonlySql(sql) {
  const withoutComments = sql
    .replace(/--.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .trim();
  if (!/^(select|with)\b/i.test(withoutComments)) {
    throw new Error("安全检查未通过：只允许 SELECT 或 WITH 查询。");
  }
  if (WRITE_KEYWORDS.test(withoutComments)) {
    throw new Error("安全检查未通过：SQL 包含写入或结构变更关键字。");
  }
  if (withoutComments.replace(/;\s*$/, "").includes(";")) {
    throw new Error("安全检查未通过：一次只能执行一条 SQL。");
  }
  return true;
}

export function executeReadonly(database, sql, maxRows = 100) {
  assertReadonlySql(sql);
  const resultSets = database.exec(sql);
  if (!resultSets.length) return { columns: [], rows: [], rowCount: 0, truncated: false };
  const result = resultSets[0];
  const truncated = result.values.length > maxRows;
  const values = result.values.slice(0, maxRows);
  return {
    columns: result.columns,
    rows: values.map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index]]))),
    rowCount: values.length,
    truncated,
  };
}

function selectScenario(question) {
  const compact = question.replace(/\s+/g, "");
  const scored = SCENARIOS.map((scenario) => ({
    scenario,
    score: scenario.terms.reduce((sum, term) => sum + (compact.includes(term.replace(/\s+/g, "")) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  if (!scored[0] || scored[0].score < 2) {
    throw new Error("本地模式只覆盖三个可验证范例。请选择范例问题，或连接自定义模型处理任意问题。");
  }
  return scored[0].scenario;
}

function schemaPrompt(tables) {
  return tables.map((table) => {
    const columns = table.columns.map(([name, type, note]) => `  ${name} ${type} -- ${note}`).join("\n");
    return `TABLE ${table.name} -- ${table.label}\n${columns}`;
  }).join("\n\n");
}

function parseModelJson(raw) {
  const text = typeof raw === "string" ? raw : "";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可解析的 JSON。");
  const parsed = JSON.parse(fenced.slice(start, end + 1));
  if (!Array.isArray(parsed.plan) || !parsed.plan.length || typeof parsed.sql !== "string") {
    throw new Error("模型返回缺少 plan 或 sql 字段。");
  }
  assertReadonlySql(parsed.sql);
  return {
    title: typeof parsed.title === "string" ? parsed.title : "动态业务查询",
    plan: parsed.plan.slice(0, 6).map(String),
    sql: parsed.sql.trim(),
  };
}

export async function requestModelPlan({ endpoint, apiKey, model, question, tables, signal }) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("请输入完整的 Chat Completions API 地址。");
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error("API 地址只支持 HTTP 或 HTTPS。");
  if (!apiKey.trim() || !model.trim()) throw new Error("模型模式需要填写模型名称和临时 API Key。");

  const system = `你是 InsightFlow 的 Text2SQL 规划器。数据库是只读 SQLite，数据快照日期为 ${SNAPSHOT_DATE}。
只根据给定 Schema 生成一条 SELECT/WITH SQL，不得使用写操作、PRAGMA、ATTACH 或不存在的字段。
时间范围必须相对数据库 MAX(order_date) 推导，不能依赖服务器当前日期。
返回严格 JSON，不要 Markdown：{"title":"短标题","plan":["步骤1","步骤2"],"sql":"SQL"}。`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: model.trim(),
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `业务问题：${question}\n\n可用 Schema：\n${schemaPrompt(tables)}` },
      ],
    }),
    signal,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`模型接口返回 ${response.status}：${detail || "无错误详情"}`);
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  return parseModelJson(content);
}

export async function buildPipeline({ question, modelConfig, signal }) {
  const keywords = extractKeywords(question);
  let tables = retrieveSchema(question, keywords);
  if (modelConfig?.enabled) {
    const generated = await requestModelPlan({ ...modelConfig, question, tables, signal });
    const sqlTables = SCHEMA.filter((table) => new RegExp(`\\b${table.name}\\b`, "i").test(generated.sql));
    if (sqlTables.length) tables = sqlTables;
    return { ...generated, keywords, tables, mode: "model" };
  }
  const scenario = selectScenario(question);
  tables = SCHEMA.filter((table) => scenario.tables.includes(table.name));
  return { ...scenario, keywords, tables, mode: "local" };
}

export function summarizeResult(pipeline, result) {
  if (!result.rowCount) return "查询成功，但没有满足条件的数据。可以检查时间窗口或筛选条件。";
  if (pipeline.id === "profitability") {
    const losses = result.rows.filter((row) => Number(row.profit) < 0);
    const streaks = result.rows.filter((row) => row.risk_signal === "连续3个月亏损");
    return `共比较 ${result.rowCount} 个地区；${losses.length} 个地区汇总利润为负。${streaks.length ? `${streaks.map((row) => row.region).join("、")} 已连续 3 个月亏损，应优先检查成本结构。` : "没有地区连续 3 个月亏损。"}`;
  }
  if (pipeline.id === "inactive-deposits") {
    const total = result.rows.reduce((sum, row) => sum + Number(row.deposit_balance || 0), 0);
    return `识别出 ${result.rowCount} 位有存款但超过 90 天未成功消费的客户，存款合计 ${formatNumber(total)} 元，可用于客户唤醒或流失风险分析。`;
  }
  if (pipeline.id === "profit-trend") {
    return `发现 ${result.rowCount} 个“收入增长、利润下滑”的反常月份。结果同时保留物流、营销和退款成本，可继续追问具体归因。`;
  }
  return `查询返回 ${result.rowCount} 行、${result.columns.length} 个字段。请结合生成 SQL 和数据口径复核业务结论。`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(Number(value));
}
