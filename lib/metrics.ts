import {
  computeRatios,
  freeCashFlow,
  type FinancialPeriod,
} from "./finance";

/**
 * 화면에서 골라 볼 수 있는 지표 목록.
 *
 * DART는 정기보고서의 재무제표만 주므로 여기 있는 것들이 전부다. P/E나 P/B처럼
 * 주가가 필요한 지표는 DART에 주가가 없어 담지 못한다.
 */
export type MetricKey =
  | "revenue"
  | "operatingIncome"
  | "netIncome"
  | "grossMargin"
  | "operatingMargin"
  | "netMargin"
  | "roe"
  | "roa"
  | "assets"
  | "equity"
  | "debtRatio"
  | "currentRatio"
  | "inventories"
  | "cashAndEquivalents"
  | "operatingCashFlow"
  | "capex"
  | "freeCashFlow";

export type MetricDef = {
  key: MetricKey;
  label: string;
  /** 금액은 막대, 비율은 선으로 그린다. */
  unit: "krw" | "percent";
  group: "실적" | "수익성" | "재무상태" | "현금흐름";
  hint?: string;
  /** 부채비율처럼 낮을수록 좋은 지표. 증감을 좋고 나쁨으로 읽을 때 쓴다. */
  lowerIsBetter?: boolean;
  value: (period: FinancialPeriod) => number | null;
};

export const METRICS: MetricDef[] = [
  {
    key: "revenue",
    label: "매출액",
    unit: "krw",
    group: "실적",
    value: (p) => p.revenue,
  },
  {
    key: "operatingIncome",
    label: "영업이익",
    unit: "krw",
    group: "실적",
    value: (p) => p.operatingIncome,
  },
  {
    key: "netIncome",
    label: "당기순이익",
    unit: "krw",
    group: "실적",
    value: (p) => p.netIncome,
  },
  {
    key: "grossMargin",
    label: "매출총이익률",
    unit: "percent",
    group: "수익성",
    hint: "매출총이익 ÷ 매출액",
    value: (p) => computeRatios(p).grossMargin,
  },
  {
    key: "operatingMargin",
    label: "영업이익률",
    unit: "percent",
    group: "수익성",
    hint: "영업이익 ÷ 매출액",
    value: (p) => computeRatios(p).operatingMargin,
  },
  {
    key: "netMargin",
    label: "순이익률",
    unit: "percent",
    group: "수익성",
    hint: "당기순이익 ÷ 매출액",
    value: (p) => computeRatios(p).netMargin,
  },
  {
    key: "roe",
    label: "ROE",
    unit: "percent",
    group: "수익성",
    hint: "당기순이익 ÷ 자본총계",
    value: (p) => computeRatios(p).roe,
  },
  {
    key: "roa",
    label: "ROA",
    unit: "percent",
    group: "수익성",
    hint: "당기순이익 ÷ 자산총계",
    value: (p) => computeRatios(p).roa,
  },
  {
    key: "assets",
    label: "자산총계",
    unit: "krw",
    group: "재무상태",
    value: (p) => p.assets,
  },
  {
    key: "equity",
    label: "자본총계",
    unit: "krw",
    group: "재무상태",
    value: (p) => p.equity,
  },
  {
    key: "debtRatio",
    label: "부채비율",
    unit: "percent",
    group: "재무상태",
    hint: "부채총계 ÷ 자본총계",
    lowerIsBetter: true,
    value: (p) => computeRatios(p).debtRatio,
  },
  {
    key: "currentRatio",
    label: "유동비율",
    unit: "percent",
    group: "재무상태",
    hint: "유동자산 ÷ 유동부채",
    value: (p) => computeRatios(p).currentRatio,
  },
  {
    key: "inventories",
    label: "재고자산",
    unit: "krw",
    group: "재무상태",
    value: (p) => p.inventories,
  },
  {
    key: "cashAndEquivalents",
    label: "현금및현금성자산",
    unit: "krw",
    group: "재무상태",
    value: (p) => p.cashAndEquivalents,
  },
  {
    key: "operatingCashFlow",
    label: "영업활동현금흐름",
    unit: "krw",
    group: "현금흐름",
    value: (p) => p.operatingCashFlow,
  },
  {
    key: "capex",
    label: "설비투자 (CAPEX)",
    unit: "krw",
    group: "현금흐름",
    hint: "현금흐름표의 유형자산 취득액",
    lowerIsBetter: true,
    value: (p) => p.capex,
  },
  {
    key: "freeCashFlow",
    label: "잉여현금흐름 (FCF)",
    unit: "krw",
    group: "현금흐름",
    hint: "영업활동현금흐름 − 설비투자",
    value: (p) => freeCashFlow(p),
  },
];

const BY_KEY = new Map(METRICS.map((metric) => [metric.key, metric]));

export const METRIC_GROUPS = ["실적", "수익성", "재무상태", "현금흐름"] as const;

export const DEFAULT_METRICS: MetricKey[] = [
  "revenue",
  "operatingMargin",
  "grossMargin",
  "capex",
];

/** URL의 m= 값을 읽어 아는 지표만 남긴다. 없으면 기본 묶음을 쓴다. */
export function parseMetrics(raw: string | undefined): MetricKey[] {
  if (raw === undefined) return DEFAULT_METRICS;
  const picked: MetricKey[] = [];
  for (const part of raw.split(",")) {
    const key = part.trim() as MetricKey;
    if (BY_KEY.has(key) && !picked.includes(key)) picked.push(key);
  }
  return picked;
}

export function metricsParam(keys: MetricKey[]): string {
  return keys.join(",");
}

export function getMetric(key: MetricKey): MetricDef {
  const found = BY_KEY.get(key);
  if (!found) throw new Error(`알 수 없는 지표: ${key}`);
  return found;
}
