import type { FinancialPeriod, Granularity } from "./finance";
import type { MetricDef } from "./metrics";

/**
 * QoQ는 직전 분기, YoY는 작년 같은 분기와 견준다.
 * 연간 보기에서는 둘 다 직전 사업연도가 되므로 "전년 대비" 하나로 합친다.
 */
export type GrowthKind = "qoq" | "yoy";

export type GrowthMode = "off" | "qoq" | "yoy" | "both";

export function parseGrowthMode(raw: string | undefined): GrowthMode {
  return raw === "qoq" || raw === "yoy" || raw === "both" ? raw : "off";
}

export function growthKinds(mode: GrowthMode, granularity: Granularity): GrowthKind[] {
  if (mode === "off") return [];
  // 연간은 직전 기간이 곧 전년이라 YoY 하나로 충분하다.
  if (granularity === "annual") return ["yoy"];
  if (mode === "both") return ["qoq", "yoy"];
  return [mode];
}

export function growthLabel(kind: GrowthKind, granularity: Granularity): string {
  if (granularity === "annual") return "전년 대비";
  return kind === "qoq" ? "직전 분기 대비" : "전년 동기 대비";
}

export function growthShortLabel(kind: GrowthKind, granularity: Granularity): string {
  if (granularity === "annual") return "YoY";
  return kind === "qoq" ? "QoQ" : "YoY";
}

export const GROWTH_COLOR: Record<GrowthKind, string> = {
  qoq: "#ff9200",
  yoy: "#15803d",
};

/** 견줄 기간을 찾는다. 빠진 분기가 있어도 되도록 연·분기로 짚는다. */
export function previousPeriod(
  periods: FinancialPeriod[],
  current: FinancialPeriod,
  kind: GrowthKind,
): FinancialPeriod | null {
  if (current.quarter === null) {
    return periods.find((period) => period.year === current.year - 1) ?? null;
  }
  if (kind === "yoy") {
    return (
      periods.find(
        (period) => period.year === current.year - 1 && period.quarter === current.quarter,
      ) ?? null
    );
  }
  const year = current.quarter === 1 ? current.year - 1 : current.year;
  const quarter = current.quarter === 1 ? 4 : current.quarter - 1;
  return (
    periods.find((period) => period.year === year && period.quarter === quarter) ?? null
  );
}

export type GrowthValue =
  | { kind: "percent"; value: number }
  /** 비율 지표는 나눈 값이 아니라 뺀 값(퍼센트포인트)이 읽기 쉽다. */
  | { kind: "point"; value: number }
  /** 적자에서의 증감률은 숫자로 쓰면 오해를 부른다. */
  | { kind: "turn"; text: string }
  | null;

/**
 * 지표 하나의 증감을 잰다.
 *
 * 금액은 증감률(%), 비율은 증감폭(%p)으로 낸다. 직전 값이 0 이하인 금액 지표는
 * 나누면 부호가 뒤집혀 엉뚱해지므로 흑자전환·적자전환으로 대신 적는다.
 */
export function metricGrowth(
  metric: MetricDef,
  current: FinancialPeriod,
  previous: FinancialPeriod | null,
): GrowthValue {
  if (!previous) return null;
  const now = metric.value(current);
  const before = metric.value(previous);
  if (now === null || before === null) return null;

  if (metric.unit === "percent") return { kind: "point", value: now - before };

  if (before > 0 && now >= 0) {
    return { kind: "percent", value: ((now - before) / before) * 100 };
  }
  if (before <= 0 && now > 0) return { kind: "turn", text: "흑자전환" };
  if (before > 0 && now < 0) return { kind: "turn", text: "적자전환" };
  if (before <= 0 && now <= 0) return { kind: "turn", text: "적자지속" };
  return null;
}

/** 차트에 겹쳐 그릴 수 있는 값만 숫자로 돌려준다. */
export function growthNumber(growth: GrowthValue): number | null {
  return growth && growth.kind !== "turn" ? growth.value : null;
}

export function formatGrowth(growth: GrowthValue): string {
  if (!growth) return "—";
  if (growth.kind === "turn") return growth.text;
  const sign = growth.value > 0 ? "+" : "";
  const unit = growth.kind === "point" ? "%p" : "%";
  return `${sign}${growth.value.toFixed(1)}${unit}`;
}

/** 좋아진 쪽인지. 부채비율처럼 낮을수록 좋은 지표는 반대로 읽는다. */
export function growthTone(
  growth: GrowthValue,
  lowerIsBetter: boolean,
): "up" | "down" | "flat" {
  if (!growth) return "flat";
  if (growth.kind === "turn") {
    if (growth.text === "흑자전환") return "up";
    if (growth.text === "적자전환") return "down";
    return "flat";
  }
  if (growth.value === 0) return "flat";
  const rising = growth.value > 0;
  return rising !== lowerIsBetter ? "up" : "down";
}
