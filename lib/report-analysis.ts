import { getReportDocument } from "./report-doc";
import {
  readReportMetrics,
  type BacklogRow,
  type PriceRow,
  type RegionalSales,
  type UtilizationRow,
} from "./report-metrics";
import type { PeriodicReport } from "./reports";

/** 사업보고서 본문에서 뽑아 여러 해를 합친 결과. */
export type BodyMetrics = {
  utilization: UtilizationRow[];
  regionalSales: RegionalSales[];
  priceChanges: PriceRow[];
  backlog: BacklogRow[];
  /** 실제로 읽어낸 보고서 */
  sources: Array<{ rceptNo: string; fiscalYear: number; viewerUrl: string }>;
  /** 받아오지 못한 보고서 수 */
  failed: number;
};

const MAX_DOCUMENTS = 5;

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

  const results = await Promise.all(
    annual.map(async (report) => {
      try {
        const sections = await getReportDocument(report.rceptNo, ["사업의 내용"]);
        return { report, metrics: readReportMetrics(sections, report.fiscalYear) };
      } catch {
        return { report, metrics: null };
      }
    }),
  );

  const utilization = new Map<string, UtilizationRow>();
  const regionalSales = new Map<number | string, RegionalSales>();
  const priceRows = new Map<string, PriceRow>();
  const priceSeen = new Set<string>();
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
      metrics.backlog.length;
    if (found > 0) {
      sources.push({
        rceptNo: report.rceptNo,
        fiscalYear: report.fiscalYear,
        viewerUrl: report.viewerUrl,
      });
    }

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

  for (const row of priceRows.values()) {
    row.values.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
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
