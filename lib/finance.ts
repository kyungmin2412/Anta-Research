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
  cashAndEquivalents: number | null;
  inventories: number | null;
  operatingCashFlow: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  /** 유형자산 취득액(자본적지출). 공시에는 유출이라 음수로 실리므로 양수로 뒤집어 담는다. */
  capex: number | null;
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
  inventories: {
    sj: ["BS"],
    flow: false,
    ids: ["ifrs-full_Inventories", "ifrs_Inventories"],
    names: /^재고자산/,
  },
  cashAndEquivalents: {
    sj: ["BS"],
    flow: false,
    ids: [
      "ifrs-full_CashAndCashEquivalents",
      "ifrs_CashAndCashEquivalents",
      "dart_CashAndCashEquivalentsAtEndOfPeriod",
    ],
    names: /^현금및현금성자산/,
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
  capex: {
    sj: ["CF"],
    flow: true,
    ids: [
      "ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
      "dart_PurchaseOfPropertyPlantAndEquipment",
      "ifrs-full_PurchaseOfPropertyPlantAndEquipment",
    ],
    // 회사마다 "유형자산의 취득", "유형자산의취득", "유형자산의 증가"로 갈린다.
    names: /^유형자산의?(취득|증가|매입)/,
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
  // 설비투자는 현금 유출이라 음수로 실린다. 크기로 견주는 지표라 양수로 뒤집는다.
  if (result.capex !== null) result.capex = Math.abs(result.capex);
  return result;
}

/** 잉여현금흐름 = 영업활동현금흐름 − 설비투자. */
export function freeCashFlow(metrics: FinancialMetrics): number | null {
  if (metrics.operatingCashFlow === null) return null;
  return metrics.operatingCashFlow - (metrics.capex ?? 0);
}

/**
 * 그 해 보고서의 손익 금액이 누적인지 가려낸다.
 *
 * 대부분은 당기누적금액 칸이 채워져 있어 누적으로 읽으면 되지만, 그 칸을 비우고
 * 당기금액에 3개월치만 싣는 회사가 있다. 이때 누적으로 알고 차감하면 엉뚱한
 * 값이 나온다. 매출은 기간이 길어질수록 줄어들 수 없으므로, 뒤 분기 매출이 앞
 * 분기보다 작으면 애초에 누적이 아니었다고 본다.
 */
function looksCumulative(byQuarter: Map<number, FinancialMetrics>): boolean {
  for (let quarter = 2; quarter <= 4; quarter++) {
    const current = byQuarter.get(quarter)?.revenue;
    const before = byQuarter.get(quarter - 1)?.revenue;
    if (current === null || current === undefined) continue;
    if (before === null || before === undefined) continue;
    if (current < before) return false;
  }
  return true;
}

/**
 * 한 분기의 3개월치를 만든다.
 *
 * 누적으로 싣는 회사는 직전 분기 누적을 뺀다. 3개월치를 싣는 회사는 1~3분기를
 * 그대로 쓰되, 4분기만은 사업보고서에 연간 총액이 실리므로 앞 세 분기를 빼야
 * 한다.
 */
function quarterMetrics(
  byQuarter: Map<number, FinancialMetrics>,
  quarter: number,
  isCumulative: boolean,
): FinancialMetrics | null {
  const current = byQuarter.get(quarter);
  if (!current) return null;

  const previous = byQuarter.get(quarter - 1);
  if (isCumulative && quarter > 1 && !previous) return null;

  const earlier = [1, 2, 3].map((q) => byQuarter.get(q));
  // 3개월치를 싣는 회사의 4분기는 앞 세 분기가 모두 있어야 뽑을 수 있다.
  if (!isCumulative && quarter === 4 && earlier.some((item) => !item)) return null;

  const derived = {} as FinancialMetrics;
  for (const key of METRIC_KEYS) {
    const value = current[key];
    if (!MATCHERS[key].flow || value === null) {
      derived[key] = value;
      continue;
    }
    if (isCumulative) {
      if (quarter === 1) derived[key] = value;
      else {
        const before = previous![key];
        derived[key] = before === null ? null : value - before;
      }
      continue;
    }
    if (quarter < 4) {
      derived[key] = value;
      continue;
    }
    const sum = earlier.reduce<number | null>(
      (acc, item) => (acc === null || item![key] === null ? null : acc + item![key]!),
      0,
    );
    derived[key] = sum === null ? null : value - sum;
  }
  return derived;
}

/** 분기 보기에서 보여줄 분기 수. 약 5년치다. */
export const QUARTER_COUNT = 20;
/** 연간 보기에서 보여줄 사업연도 수. */
export const ANNUAL_COUNT = 5;

const QUARTER_REPORT: Record<number, ReportCode> = {
  1: REPORT_CODE.Q1,
  2: REPORT_CODE.HALF,
  3: REPORT_CODE.Q3,
  4: REPORT_CODE.ANNUAL,
};

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

type PeriodRequest = { year: number; reportCode: ReportCode };

/**
 * 한 번에 던지는 요청 수 상한.
 *
 * 20분기를 보면 보고서를 스물두 건 읽어야 한다. 전부 한꺼번에 던지면 DART가
 * 조일 수 있고, 그때 실패한 기간은 차트에서 조용히 빠져 원인을 찾기 어렵다.
 * 연간(5건)과 8분기(10건)는 이 상한에 걸리지 않아 그대로 한 번에 나간다.
 */
const MAX_CONCURRENT = 12;

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 여러 기간의 보고서를 한꺼번에 가져온다.
 *
 * 연결을 전 기간에 먼저 던지고, 하나도 없을 때만 별도로 다시 던진다. 기간마다
 * 연결→별도로 물러서면 아직 공시되지 않은 보고서 하나 때문에 전체가 DART를 한
 * 번 더 왕복하게 된다. 한 회사의 추이를 볼 때 연결과 별도를 섞으면 비교 기준도
 * 어긋나므로, 회사 단위로 한 가지 기준을 정하는 편이 맞다.
 */
async function fetchPeriods(
  corpCode: string,
  targets: PeriodRequest[],
  cumulative: boolean,
): Promise<{ metrics: Array<FinancialMetrics | null>; fsDiv: "CFS" | "OFS" | null }> {
  for (const fsDiv of ["CFS", "OFS"] as const) {
    const metrics = await mapWithLimit(targets, MAX_CONCURRENT, (target) =>
      fetchOne(corpCode, target.year, target.reportCode, fsDiv, cumulative).catch(
        () => null,
      ),
    );
    if (metrics.some((item) => item !== null)) return { metrics, fsDiv };
  }
  return { metrics: targets.map(() => null), fsDiv: null };
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
  count = ANNUAL_COUNT,
): Promise<FinancialSeries> {
  const latest = latestBusinessYear();
  const targets = Array.from({ length: count }, (_, i) => latest - i);

  const { metrics, fsDiv } = await fetchPeriods(
    corpCode,
    targets.map((year) => ({ year, reportCode: REPORT_CODE.ANNUAL })),
    false,
  );

  const periods: FinancialPeriod[] = [];
  metrics.forEach((item, index) => {
    if (!item || !fsDiv) return;
    const year = targets[index];
    periods.push({ ...item, label: `${year}`, year, quarter: null, fsDiv });
  });
  periods.sort((a, b) => a.year - b.year);

  return { periods, fsDiv, granularity: "annual" };
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
  count = QUARTER_COUNT,
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

  const { metrics, fsDiv } = await fetchPeriods(
    corpCode,
    requests.map(({ year, quarter }) => ({
      year,
      reportCode: QUARTER_REPORT[quarter],
    })),
    true,
  );

  const byYear = new Map<number, Map<number, FinancialMetrics>>();
  requests.forEach(({ year, quarter }, index) => {
    const item = metrics[index];
    if (!item) return;
    const slot = byYear.get(year) ?? new Map<number, FinancialMetrics>();
    slot.set(quarter, item);
    byYear.set(year, slot);
  });

  // 회사마다 공시 모양이 달라 연도별로 누적인지 아닌지 가려 둔다.
  const cumulativeYear = new Map<number, boolean>();
  for (const [year, slot] of byYear) cumulativeYear.set(year, looksCumulative(slot));

  const periods: FinancialPeriod[] = [];
  for (const { year, quarter } of targets) {
    const slot = byYear.get(year);
    const current = slot?.get(quarter);
    if (!slot || !current) continue;

    const derived = quarterMetrics(slot, quarter, cumulativeYear.get(year) ?? true);
    if (!derived) continue;

    periods.push({
      ...derived,
      label: `${String(year).slice(2)} ${quarter}Q`,
      year,
      quarter,
      fsDiv: fsDiv!,
    });
  }

  return { periods, fsDiv, granularity: "quarter" };
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
  const years = [latest, latest - 1];
  // 두 해를 한 번에 던진다. 연도별로 기다리면 DART를 두 번 왕복하게 된다.
  const settled = await Promise.all(
    years.map((year) =>
      Promise.all([
        fetchOne(corpCode, year, REPORT_CODE.ANNUAL, "CFS", false).catch(() => null),
        fetchOne(corpCode, year, REPORT_CODE.ANNUAL, "OFS", false).catch(() => null),
      ]),
    ),
  );
  for (let i = 0; i < years.length; i++) {
    const [consolidated, separate] = settled[i];
    // 연결과 별도가 모두 있어야 비교가 의미 있다.
    if (consolidated && separate) return { year: years[i], consolidated, separate };
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
