import { dartJsonOptional, REPORT_CODE } from "./dart";

type RawAccount = {
  sj_div: string;
  sj_nm: string;
  account_id: string;
  account_nm: string;
  account_detail?: string;
  thstrm_amount: string;
  frmtrm_amount?: string;
  bfefrmtrm_amount?: string;
  currency?: string;
};

type FnlttResponse = {
  status: string;
  message: string;
  list?: RawAccount[];
};

export type FinancialYear = {
  year: number;
  fsDiv: "CFS" | "OFS";
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

export type FinancialSeries = {
  years: FinancialYear[];
  fsDiv: "CFS" | "OFS" | null;
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

type Matcher = { sj: string[]; ids: string[]; names?: RegExp };

const MATCHERS: Record<keyof Omit<FinancialYear, "year" | "fsDiv">, Matcher> = {
  revenue: {
    sj: ["IS", "CIS"],
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
    ids: ["ifrs-full_GrossProfit", "ifrs_GrossProfit"],
    names: /^매출총이익/,
  },
  operatingIncome: {
    sj: ["IS", "CIS"],
    ids: [
      "dart_OperatingIncomeLoss",
      "ifrs-full_ProfitLossFromOperatingActivities",
      "ifrs_ProfitLossFromOperatingActivities",
    ],
    names: /^영업이익/,
  },
  netIncome: {
    sj: ["IS", "CIS"],
    ids: ["ifrs-full_ProfitLoss", "ifrs_ProfitLoss"],
    names: /^(당기순이익|당기순이익\(손실\)|분기순이익)/,
  },
  assets: {
    sj: ["BS"],
    ids: ["ifrs-full_Assets", "ifrs_Assets"],
    names: /^자산총계/,
  },
  currentAssets: {
    sj: ["BS"],
    ids: ["ifrs-full_CurrentAssets", "ifrs_CurrentAssets"],
    names: /^유동자산/,
  },
  liabilities: {
    sj: ["BS"],
    ids: ["ifrs-full_Liabilities", "ifrs_Liabilities"],
    names: /^부채총계/,
  },
  currentLiabilities: {
    sj: ["BS"],
    ids: ["ifrs-full_CurrentLiabilities", "ifrs_CurrentLiabilities"],
    names: /^유동부채/,
  },
  equity: {
    sj: ["BS"],
    ids: ["ifrs-full_Equity", "ifrs_Equity"],
    names: /^자본총계/,
  },
  operatingCashFlow: {
    sj: ["CF"],
    ids: ["ifrs-full_CashFlowsFromUsedInOperatingActivities"],
    names: /영업활동.*현금흐름/,
  },
  investingCashFlow: {
    sj: ["CF"],
    ids: ["ifrs-full_CashFlowsFromUsedInInvestingActivities"],
    names: /투자활동.*현금흐름/,
  },
  financingCashFlow: {
    sj: ["CF"],
    ids: ["ifrs-full_CashFlowsFromUsedInFinancingActivities"],
    names: /재무활동.*현금흐름/,
  },
};

function pick(rows: RawAccount[], matcher: Matcher): number | null {
  const scoped = rows.filter((row) => matcher.sj.includes(row.sj_div));
  for (const id of matcher.ids) {
    const hit = scoped.find((row) => row.account_id === id);
    const value = toNumber(hit?.thstrm_amount);
    if (value !== null) return value;
  }
  if (matcher.names) {
    const hit = scoped.find((row) => matcher.names!.test(row.account_nm.replace(/\s/g, "")));
    const value = toNumber(hit?.thstrm_amount);
    if (value !== null) return value;
  }
  return null;
}

function buildYear(rows: RawAccount[], year: number, fsDiv: "CFS" | "OFS"): FinancialYear {
  const result = { year, fsDiv } as FinancialYear;
  for (const [key, matcher] of Object.entries(MATCHERS) as Array<
    [keyof Omit<FinancialYear, "year" | "fsDiv">, Matcher]
  >) {
    result[key] = pick(rows, matcher);
  }
  return result;
}

async function fetchYear(
  corpCode: string,
  year: number,
): Promise<FinancialYear | null> {
  for (const fsDiv of ["CFS", "OFS"] as const) {
    const data = await dartJsonOptional<FnlttResponse>(
      "fnlttSinglAcntAll.json",
      {
        corp_code: corpCode,
        bsns_year: year,
        reprt_code: REPORT_CODE.ANNUAL,
        fs_div: fsDiv,
      },
      60 * 60 * 12,
    );
    const rows = data?.list;
    if (!rows || rows.length === 0) continue;
    const parsed = buildYear(rows, year, fsDiv);
    if (parsed.revenue !== null || parsed.assets !== null) return parsed;
  }
  return null;
}

/** 최근 사업연도부터 count개 연도의 연간 재무 데이터를 모은다. */
export async function getFinancialSeries(
  corpCode: string,
  count = 5,
): Promise<FinancialSeries> {
  const now = new Date();
  // 사업보고서는 결산 후 90일 이내 제출되므로 4월 이전에는 전전년도가 최신이다.
  const latest = now.getMonth() >= 3 ? now.getFullYear() - 1 : now.getFullYear() - 2;
  const targets = Array.from({ length: count }, (_, i) => latest - i);

  const settled = await Promise.all(
    targets.map((year) => fetchYear(corpCode, year).catch(() => null)),
  );
  const years = settled
    .filter((year): year is FinancialYear => year !== null)
    .sort((a, b) => a.year - b.year);

  return { years, fsDiv: years.at(-1)?.fsDiv ?? null };
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
  year: FinancialYear,
  previous?: FinancialYear,
): Ratios {
  return {
    operatingMargin: ratio(year.operatingIncome, year.revenue),
    netMargin: ratio(year.netIncome, year.revenue),
    grossMargin: ratio(year.grossProfit, year.revenue),
    roe: ratio(year.netIncome, year.equity),
    roa: ratio(year.netIncome, year.assets),
    debtRatio: ratio(year.liabilities, year.equity),
    currentRatio: ratio(year.currentAssets, year.currentLiabilities),
    equityRatio: ratio(year.equity, year.assets),
    revenueGrowth: growth(year.revenue, previous?.revenue ?? null),
    operatingIncomeGrowth: growth(year.operatingIncome, previous?.operatingIncome ?? null),
  };
}
