import { getReportDocument } from "./report-doc";
import {
  readReportMetrics,
  type BacklogRow,
  type PriceRow,
  type RegionalSales,
  type SubsidiaryFinancialRow,
  type UtilizationRow,
} from "./report-metrics";
import type { PeriodicReport } from "./reports";

/** 사업보고서 본문에서 뽑아 여러 해를 합친 결과. */
export type BodyMetrics = {
  utilization: UtilizationRow[];
  regionalSales: RegionalSales[];
  priceChanges: PriceRow[];
  backlog: BacklogRow[];
  subsidiaries: SubsidiaryFinancialRow[];
  /** 실제로 읽어낸 보고서 */
  sources: Array<{ rceptNo: string; fiscalYear: number; viewerUrl: string }>;
  /** 받아오지 못한 보고서 수 */
  failed: number;
};

const MAX_DOCUMENTS = 5;
// 종속기업 실적은 사업보고서뿐 아니라 반기보고서 주석에도 실린다. 최근 걸 더 보태면
// 사업연도 사이 빈 구간이 반기 단위로 채워진다.
const MAX_HALF_DOCUMENTS = 4;
// 분기보고서(1·3분기)에도 같은 노트가 실린다. 사업연도당 두 건(1분기·3분기)이라
// 4건이면 최근 2개년치 분기 실적을 채울 수 있다.
const MAX_QUARTER_DOCUMENTS = 4;

/** 품목을 가리키는 열쇠. 품목 이름에 공백이 흔해 문자열로 이어 붙이면 안 된다. */
function itemKey(segment: string, item: string): string {
  return JSON.stringify([segment, item]);
}

/**
 * 사업보고서를 최신순으로 읽어 본문 지표를 합친다.
 *
 * 한 해 값이 여러 보고서에 겹쳐 실린다(사업보고서는 보통 세 사업연도를 함께 싣는다).
 * 뒤에 낸 보고서가 정정을 반영하고 있으므로 최신 보고서 값을 남긴다.
 */
export async function getBodyMetrics(reports: PeriodicReport[]): Promise<BodyMetrics> {
  const annual = reports
    .filter((report) => report.kind === "annual")
    .sort((a, b) => b.fiscalYear - a.fiscalYear)
    .slice(0, MAX_DOCUMENTS);
  const half = reports
    .filter((report) => report.kind === "half")
    .sort((a, b) => b.rceptNo.localeCompare(a.rceptNo))
    .slice(0, MAX_HALF_DOCUMENTS);
  const quarter = reports
    .filter((report) => report.kind === "quarter")
    .sort((a, b) => b.rceptNo.localeCompare(a.rceptNo))
    .slice(0, MAX_QUARTER_DOCUMENTS);
  const documents = [...annual, ...half, ...quarter];

  const results = await Promise.all(
    documents.map(async (report) => {
      try {
        const sections = await getReportDocument(report.rceptNo, [
          "사업의 내용",
          "재무에 관한 사항",
        ]);
        return { report, metrics: readReportMetrics(sections, report) };
      } catch {
        return { report, metrics: null };
      }
    }),
  );

  const utilization = new Map<string, UtilizationRow>();
  const regionalSales = new Map<number | string, RegionalSales>();
  const priceRows = new Map<string, PriceRow>();
  const priceSeen = new Set<string>();
  const rawSubsidiaries = new Map<string, SubsidiaryFinancialRow>();
  let backlog: BacklogRow[] = [];
  const sources: BodyMetrics["sources"] = [];
  let failed = 0;

  // 최신 보고서부터 채우고, 이미 채운 기간은 덮어쓰지 않는다.
  for (const { report, metrics } of results) {
    if (!metrics) {
      failed += 1;
      continue;
    }
    const found =
      metrics.utilization.length +
      metrics.regionalSales.length +
      metrics.priceChanges.length +
      metrics.backlog.length +
      metrics.subsidiaries.length;
    if (found > 0) {
      sources.push({
        rceptNo: report.rceptNo,
        fiscalYear: report.fiscalYear,
        viewerUrl: report.viewerUrl,
      });
    }

    // "사업의 내용" 지표는 사업보고서에만 온전히 실린다. 반기보고서는 종속기업
    // 실적만 쓰고 이쪽은 건드리지 않는다.
    if (report.kind === "annual") {
      for (const row of metrics.utilization) {
        const key = `${itemKey(row.segment, row.item)}#${row.year ?? report.fiscalYear}`;
        if (!utilization.has(key)) utilization.set(key, row);
      }
      for (const row of metrics.regionalSales) {
        const key = row.year ?? row.label;
        if (!regionalSales.has(key)) regionalSales.set(key, row);
      }
      for (const row of metrics.priceChanges) {
        const bucket = priceRows.get(row.item) ?? { item: row.item, values: [] };
        for (const value of row.values) {
          const key = `${row.item}#${value.year ?? value.label}`;
          if (priceSeen.has(key)) continue;
          priceSeen.add(key);
          bucket.values.push(value);
        }
        priceRows.set(row.item, bucket);
      }
      if (backlog.length === 0) backlog = metrics.backlog;
    }

    for (const row of metrics.subsidiaries) {
      if (row.year === null) continue;
      // 같은 이름·연도라도 몇 분기 시점까지의 누적인지가 다르면 따로 둔다.
      const key = `${row.name}#${row.year}#${row.quarterIndex}`;
      if (!rawSubsidiaries.has(key)) rawSubsidiaries.set(key, row);
    }
  }

  for (const row of priceRows.values()) {
    row.values.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  }

  // 종속기업 매출·순손익은 사업연도 시작부터의 누적치다. 1분기는 그 자체로 분기
  // 단독 실적이라 손대지 않는다. 2·3분기는 직전 분기 누적을 빼야 그 분기만의
  // 실적이 나온다(2분기 실적 = 반기 누적 − 1분기). 직전 분기 자료가 없으면 억지로
  // 추정하지 않고 비워 둔다.
  const subtract = (current: number | null, previous: number | null | undefined) =>
    current === null || previous == null ? null : current - previous;

  const subsidiaries = new Map<string, SubsidiaryFinancialRow>();
  for (const [key, raw] of rawSubsidiaries) {
    if (raw.quarterIndex === 1) {
      subsidiaries.set(key, raw);
      continue;
    }
    if (raw.quarterIndex === 4) {
      // 사업보고서(연간)는 연간 총액 그대로도 남긴다 — 3분기 자료가 없는 옛
      // 연도까지 값이 비어 버리는 걸 막기 위해서다.
      subsidiaries.set(key, raw);
      // 3분기 누적이 있으면 연간 총액에서 빼 4분기 단독 실적도 따로 만든다.
      const q3 = rawSubsidiaries.get(`${raw.name}#${raw.year}#3`);
      if (q3) {
        subsidiaries.set(`${key}#4분기`, {
          ...raw,
          periodLabel: `${raw.year}년 4분기`,
          revenue: subtract(raw.revenue, q3.revenue),
          netIncome: subtract(raw.netIncome, q3.netIncome),
        });
      }
      continue;
    }
    const previous = rawSubsidiaries.get(`${raw.name}#${raw.year}#${raw.quarterIndex - 1}`);
    subsidiaries.set(key, {
      ...raw,
      revenue: subtract(raw.revenue, previous?.revenue),
      netIncome: subtract(raw.netIncome, previous?.netIncome),
    });
  }

  return {
    utilization: [...utilization.values()].sort(
      (a, b) =>
        a.segment.localeCompare(b.segment) ||
        a.item.localeCompare(b.item) ||
        (a.year ?? 0) - (b.year ?? 0),
    ),
    regionalSales: [...regionalSales.values()].sort((a, b) => (a.year ?? 0) - (b.year ?? 0)),
    priceChanges: [...priceRows.values()],
    backlog,
    subsidiaries: [...subsidiaries.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || (a.year ?? 0) - (b.year ?? 0),
    ),
    sources,
    failed,
  };
}

/** 가동률을 품목별 시계열로 바꾼다. 차트가 바로 쓸 수 있는 모양이다. */
export function utilizationSeries(rows: UtilizationRow[]) {
  const years = [
    ...new Set(rows.map((row) => row.year).filter((year): year is number => year !== null)),
  ].sort();

  const items: Array<{ segment: string; item: string }> = [];
  for (const row of rows) {
    if (!items.some((seen) => seen.segment === row.segment && seen.item === row.item)) {
      items.push({ segment: row.segment, item: row.item });
    }
  }

  const series = items.map((entry, index) => ({
    key: `s${index}`,
    name:
      entry.segment && entry.segment !== entry.item
        ? `${entry.segment} ${entry.item}`
        : entry.item,
  }));

  const data = years.map((year) => {
    const point: Record<string, string | number | null> = { label: `${year}` };
    items.forEach((entry, index) => {
      const match = rows.find(
        (row) => row.segment === entry.segment && row.item === entry.item && row.year === year,
      );
      point[`s${index}`] = match?.rate ?? null;
    });
    return point;
  });

  return { series, data };
}
