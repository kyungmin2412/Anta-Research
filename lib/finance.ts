import { dartJsonOptional, REPORT_CODE, type ReportCode } from "./dart";

type RawAccount = {
  sj_div: string;
  sj_nm: string;
  account_id: string;
  account_nm: string;
  account_detail?: string;
  thstrm_amount: string;
  /** 당기누적금액. 분기·반기보고서에서 손익/현금흐름의 누적치가 담긴다. */
  thstrm_add_amount?: string;
  frmtrm_amount?: string;
  bfefrmtrm_amount?: string;
  currency?: string;
};

type FnlttResponse = {
  status: string;
  message: string;
  list?: RawAccount[];
};

export type FinancialMetrics = {
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  assets: number | null;
  currentAssets: number | null;
  liabilities: number | null;
  currentLiabilities: number | null;
  equity: number | null;
  operatingCashFlow: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
};

export type FinancialPeriod = FinancialMetrics & {
  /** 차트 축과 표 머리글에 쓰는 표기. 연간은 "2025", 분기는 "25 3Q". */
  label: string;
  year: number;
  /** 연간이면 null */
  quarter: number | null;
  fsDiv: "CFS" | "OFS";
};

export type Granularity = "annual" | "quarter";

export type FinancialSeries = {
  periods: FinancialPeriod[];
  fsDiv: "CFS" | "OFS" | null;
  granularity: Granularity;
};

function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const negative = /^\(.*\)$/.test(cleaned);
  const value = Number(negative ? cleaned.slice(1, -1) : cleaned);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** 재무상태표 계정은 시점값(stock), 손익·현금흐름은 기간값(flow)이다. */
type Matcher = { sj: string[]; ids: string[]; names?: RegExp; flow: boolean };

const MATCHERS: Record<keyof FinancialMetrics, Matcher> = {
  revenue: {
    sj: ["IS", "CIS"],
    flow: true,
    ids: [
      "ifrs-full_Revenue",
      "ifrs-full_RevenueFromContractsWithCustomers",
      "ifrs_Revenue",
      "dart_OperatingRevenue",
    ],
    names: /^(수익\(매출액\)|매출액|영업수익|매출)$/,
  },
  grossProfit: {
    sj: ["IS", "CIS"],
    flow: true,
    ids: ["ifrs-full_GrossProfit", "ifrs_GrossProfit"],
    names: /^매출총이익/,
  },
  operatingIncome: {
    sj: ["IS", "CIS"],
    flow: true,
    ids: [
      "dart_OperatingIncomeLoss",
      "ifrs-full_ProfitLossFromOperatingActivities",
      "ifrs_ProfitLossFromOperatingActivities",
    ],
    names: /^영업이익/,
  },
  netIncome: {
    sj: ["IS", "CIS"],
    flow: true,
    ids: ["ifrs-full_ProfitLoss", "ifrs_ProfitLoss"],
    names: /^(당기순이익|당기순이익\(손실\)|분기순이익)/,
  },
  assets: {
    sj: ["BS"],
    flow: false,
    ids: ["ifrs-full_Assets", "ifrs_Assets"],
    names: /^자산총계/,
  },
  currentAssets: {
    sj: ["BS"],
    flow: false,
    ids: ["ifrs-full_CurrentAssets", "ifrs_CurrentAssets"],
    names: /^유동자산/,
  },
  liabilities: {
    sj: ["BS"],
    flow: false,
    ids: ["ifrs-full_Liabilities", "ifrs_Liabilities"],
    names: /^부채총계/,
  },
  currentLiabilities: {
    sj: ["BS"],
    flow: false,
    ids: ["ifrs-full_CurrentLiabilities", "ifrs_CurrentLiabilities"],
    names: /^유동부채/,
  },
  equity: {
    sj: ["BS"],
    flow: false,
    ids: ["ifrs-full_Equity", "ifrs_Equity"],
    names: /^자본총계/,
  },
  operatingCashFlow: {
    sj: ["CF"],
    flow: true,
    ids: ["ifrs-full_CashFlowsFromUsedInOperatingActivities"],
    names: /영업활동.*현금흐름/,
  },
  investingCashFlow: {
    sj: ["CF"],
    flow: true,
    ids: ["ifrs-full_CashFlowsFromUsedInInvestingActivities"],
    names: /투자활동.*현금흐름/,
  },
  financingCashFlow: {
    sj: ["CF"],
    flow: true,
    ids: ["ifrs-full_CashFlowsFromUsedInFinancingActivities"],
    names: /재무활동.*현금흐름/,
  },
};

const METRIC_KEYS = Object.keys(MATCHERS) as Array<keyof FinancialMetrics>;

/**
 * 분기·반기보고서의 손익/현금흐름은 누적치를 쓴다. 회사에 따라 3개월치를
 * thstrm_amount에, 누적을 thstrm_add_amount에 싣기도 하고 누적만 싣기도 해서
 * 누적 칸이 있으면 그쪽을 우선한다.
 */
function amountOf(row: RawAccount, cumulative: boolean): number | null {
  if (cumulative) {
    const add = toNumber(row.thstrm_add_amount);
    if (add !== null) return add;
  }
  return toNumber(row.thstrm_amount);
}

function pick(rows: RawAccount[], matcher: Matcher, cumulative: boolean): number | null {
  const useCumulative = cumulative && matcher.flow;
  const scoped = rows.filter((row) => matcher.sj.includes(row.sj_div));
  for (const id of matcher.ids) {
    const hit = scoped.find((row) => row.account_id === id);
    const value = hit ? amountOf(hit, useCumulative) : null;
    if (value !== null) return value;
  }
  if (matcher.names) {
    const hit = scoped.find((row) =>
      matcher.names!.test(row.account_nm.replace(/\s/g, "")),
    );
    const value = hit ? amountOf(hit, useCumulative) : null;
    if (value !== null) return value;
  }
  return null;
}

function buildMetrics(rows: RawAccount[], cumulative: boolean): FinancialMetrics {
  const result = {} as FinancialMetrics;
  for (const key of METRIC_KEYS) result[key] = pick(rows, MATCHERS[key], cumulative);
  return result;
}

const QUARTER_REPORT: Record<number, ReportCode> = {
  1: REPORT_CODE.Q1,
  2: REPORT_CODE.HALF,
  3: REPORT_CODE.Q3,
  4: REPORT_CODE.ANNUAL,
};

type Snapshot = { metrics: FinancialMetrics; fsDiv: "CFS" | "OFS" };

async function fetchOne(
  corpCode: string,
  year: number,
  reportCode: ReportCode,
  fsDiv: "CFS" | "OFS",
  cumulative: boolean,
): Promise<FinancialMetrics | null> {
  const data = await dartJsonOptional<FnlttResponse>(
    "fnlttSinglAcntAll.json",
    { corp_code: corpCode, bsns_year: year, reprt_code: reportCode, fs_div: fsDiv },
    60 * 60 * 12,
  );
  const rows = data?.list;
  if (!rows || rows.length === 0) return null;
  const metrics = buildMetrics(rows, cumulative);
  if (metrics.revenue === null && metrics.assets === null) return null;
  return metrics;
}

/** 한 보고서를 읽어 계정을 뽑는다. 연결이 없으면 별도로 물러선다. */
async function fetchReport(
  corpCode: string,
  year: number,
  reportCode: ReportCode,
  cumulative: boolean,
): Promise<Snapshot | null> {
  for (const fsDiv of ["CFS", "OFS"] as const) {
    const metrics = await fetchOne(corpCode, year, reportCode, fsDiv, cumulative);
    if (metrics) return { metrics, fsDiv };
  }
  return null;
}

/**
 * 사업보고서가 나와 있을 법한 가장 최근 사업연도.
 * 결산 후 90일 이내 제출이므로 4월 이전에는 전전년도가 최신이다.
 */
export function latestBusinessYear(now = new Date()): number {
  return now.getMonth() >= 3 ? now.getFullYear() - 1 : now.getFullYear() - 2;
}

/**
 * 공시되어 있을 법한 가장 최근 분기.
 * 분기·반기보고서는 분기말 후 45일, 사업보고서는 90일 이내 제출된다.
 */
export function latestQuarter(now = new Date()): { year: number; quarter: number } {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  if (month >= 10) return { year, quarter: 3 }; // 11/14 이후
  if (month >= 7) return { year, quarter: 2 }; // 8/14 이후
  if (month >= 4) return { year, quarter: 1 }; // 5/15 이후
  if (month >= 3) return { year: year - 1, quarter: 4 }; // 3/31 이후
  return { year: year - 1, quarter: 3 };
}

/** 최근 사업연도부터 count개 연도의 연간 재무 데이터를 모은다. */
export async function getAnnualSeries(
  corpCode: string,
  count = 5,
): Promise<FinancialSeries> {
  const latest = latestBusinessYear();
  const targets = Array.from({ length: count }, (_, i) => latest - i);

  const settled = await Promise.all(
    targets.map((year) =>
      fetchReport(corpCode, year, REPORT_CODE.ANNUAL, false).catch(() => null),
    ),
  );

  const periods: FinancialPeriod[] = [];
  settled.forEach((snapshot, index) => {
    if (!snapshot) return;
    const year = targets[index];
    periods.push({
      ...snapshot.metrics,
      label: `${year}`,
      year,
      quarter: null,
      fsDiv: snapshot.fsDiv,
    });
  });
  periods.sort((a, b) => a.year - b.year);

  return { periods, fsDiv: periods.at(-1)?.fsDiv ?? null, granularity: "annual" };
}

/**
 * 최근 count개 분기의 재무 데이터를 모은다.
 *
 * 분기보고서의 손익·현금흐름은 누적으로 공시되므로 직전 분기 누적을 빼서
 * 해당 분기 3개월치를 만든다(2분기 = 반기누적 − 1분기). 재무상태표는
 * 분기말 시점값이라 그대로 쓴다.
 */
export async function getQuarterlySeries(
  corpCode: string,
  count = 8,
): Promise<FinancialSeries> {
  const latest = latestQuarter();

  // 최근 count개 분기를 과거→현재 순으로 나열한다.
  const targets: Array<{ year: number; quarter: number }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const offset = latest.quarter - 1 - i;
    targets.push({
      year: latest.year + Math.floor(offset / 4),
      quarter: ((offset % 4) + 4) % 4 + 1,
    });
  }

  // 차감에 쓰려면 각 연도의 1분기부터 필요한 분기까지 누적치가 있어야 한다.
  const needed = new Map<number, number>();
  for (const { year, quarter } of targets) {
    needed.set(year, Math.max(needed.get(year) ?? 0, quarter));
  }

  const requests: Array<{ year: number; quarter: number }> = [];
  for (const [year, maxQuarter] of needed) {
    for (let quarter = 1; quarter <= maxQuarter; quarter++) {
      requests.push({ year, quarter });
    }
  }

  const settled = await Promise.all(
    requests.map(({ year, quarter }) =>
      fetchReport(corpCode, year, QUARTER_REPORT[quarter], true).catch(() => null),
    ),
  );

  const cumulative = new Map<string, Snapshot>();
  requests.forEach(({ year, quarter }, index) => {
    const snapshot = settled[index];
    if (snapshot) cumulative.set(`${year}-${quarter}`, snapshot);
  });

  const periods: FinancialPeriod[] = [];
  for (const { year, quarter } of targets) {
    const current = cumulative.get(`${year}-${quarter}`);
    if (!current) continue;
    const previous = quarter > 1 ? cumulative.get(`${year}-${quarter - 1}`) : null;
    // 2분기 이후인데 직전 누적이 없으면 차감할 수 없어 건너뛴다.
    if (quarter > 1 && !previous) continue;

    const metrics = {} as FinancialMetrics;
    for (const key of METRIC_KEYS) {
      const value = current.metrics[key];
      if (!MATCHERS[key].flow) {
        metrics[key] = value;
        continue;
      }
      if (value === null) {
        metrics[key] = null;
      } else if (quarter === 1) {
        metrics[key] = value;
      } else {
        const before = previous!.metrics[key];
        metrics[key] = before === null ? null : value - before;
      }
    }

    periods.push({
      ...metrics,
      label: `${String(year).slice(2)} ${quarter}Q`,
      year,
      quarter,
      fsDiv: current.fsDiv,
    });
  }

  return { periods, fsDiv: periods.at(-1)?.fsDiv ?? null, granularity: "quarter" };
}

export type SeparateComparison = {
  year: number;
  consolidated: FinancialMetrics | null;
  separate: FinancialMetrics | null;
};

/**
 * 같은 사업연도의 연결·별도 재무제표를 나란히 가져온다.
 * 둘의 차이가 곧 자회사가 실적에 보탠 몫에 가깝다.
 */
export async function getSeparateSnapshot(
  corpCode: string,
): Promise<SeparateComparison | null> {
  const latest = latestBusinessYear();
  for (const year of [latest, latest - 1]) {
    const [consolidated, separate] = await Promise.all([
      fetchOne(corpCode, year, REPORT_CODE.ANNUAL, "CFS", false).catch(() => null),
      fetchOne(corpCode, year, REPORT_CODE.ANNUAL, "OFS", false).catch(() => null),
    ]);
    // 연결과 별도가 모두 있어야 비교가 의미 있다.
    if (consolidated && separate) return { year, consolidated, separate };
  }
  return null;
}

export function getFinancialSeries(
  corpCode: string,
  granularity: Granularity,
): Promise<FinancialSeries> {
  return granularity === "quarter"
    ? getQuarterlySeries(corpCode)
    : getAnnualSeries(corpCode);
}

export type Ratios = {
  operatingMargin: number | null;
  netMargin: number | null;
  grossMargin: number | null;
  roe: number | null;
  roa: number | null;
  debtRatio: number | null;
  currentRatio: number | null;
  equityRatio: number | null;
  revenueGrowth: number | null;
  operatingIncomeGrowth: number | null;
};

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function growth(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function computeRatios(
  period: FinancialMetrics,
  previous?: FinancialMetrics,
): Ratios {
  return {
    operatingMargin: ratio(period.operatingIncome, period.revenue),
    netMargin: ratio(period.netIncome, period.revenue),
    grossMargin: ratio(period.grossProfit, period.revenue),
    roe: ratio(period.netIncome, period.equity),
    roa: ratio(period.netIncome, period.assets),
    debtRatio: ratio(period.liabilities, period.equity),
    currentRatio: ratio(period.currentAssets, period.currentLiabilities),
    equityRatio: ratio(period.equity, period.assets),
    revenueGrowth: growth(period.revenue, previous?.revenue ?? null),
    operatingIncomeGrowth: growth(
      period.operatingIncome,
      previous?.operatingIncome ?? null,
    ),
  };
}
