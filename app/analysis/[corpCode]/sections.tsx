import { DownloadCsvButton } from "@/components/DownloadCsvButton";
import { MetricChart, MultiLineChart } from "@/components/FinancialCharts";
import { DeltaBadge, EmptyState, Section } from "@/components/ui";
import { compareColor } from "@/lib/compare";
import { getFinancialSeries, type Granularity } from "@/lib/finance";
import { formatKrw } from "@/lib/format";
import { getBodyMetrics, utilizationSeries } from "@/lib/report-analysis";
import type { PeriodicReport } from "@/lib/reports";

/**
 * 재고자산 추이. 사업보고서 본문이 아니라 재무제표 API 값이라 파싱이 필요 없지만,
 * "이 회사만의 변동"을 한 화면에서 보고 싶다는 요청이라 여기 같이 둔다.
 */
export async function InventorySection({
  corpCode,
  granularity,
}: {
  corpCode: string;
  granularity: Granularity;
}) {
  const series = await getFinancialSeries(corpCode, granularity);
  const points = series.periods.filter((period) => period.inventories !== null);
  if (points.length === 0) return null;

  const latest = points.at(-1)!;
  const before = points.length > 1 ? points.at(-2)! : null;
  const change =
    before && before.inventories
      ? ((latest.inventories! - before.inventories) / before.inventories) * 100
      : null;
  const periodUnit = granularity === "quarter" ? "분기" : "사업연도";
  const changeLabel = granularity === "quarter" ? "전분기比" : "전년比";

  return (
    <Section
      title="재고자산 추이"
      description={`최근 ${points.length}개 ${periodUnit} · ${series.fsDiv === "CFS" ? "연결" : "별도"}재무제표`}
    >
      <div className="card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-bold text-grey-900">재고자산</p>
          <div className="text-right">
            <p className="tnum text-[18px] font-bold text-grey-900">
              {formatKrw(latest.inventories)}
            </p>
            {change !== null && (
              <p
                className={`tnum text-[12px] font-medium ${change >= 0 ? "text-red-500" : "text-blue-600"}`}
              >
                {changeLabel} {change > 0 ? "+" : ""}
                {change.toFixed(1)}%
              </p>
            )}
          </div>
        </div>
        <div className="mt-3">
          <MetricChart
            name="재고자산"
            unit="krw"
            data={points.map((period) => ({ label: period.label, value: period.inventories }))}
          />
        </div>
      </div>
    </Section>
  );
}

function priceColumnName(value: {
  year: number | null;
  quarterIndex: number | null;
  label: string;
}): string {
  if (!value.year) return value.label;
  return value.quarterIndex ? `${value.year}년 ${value.quarterIndex}분기` : `${value.year}년`;
}

/** "2025년 1분기" → "2025년 2분기" → "2025년 3분기" → "2025년"(연간) 순으로. */
function periodSortKey(label: string): [number, number] {
  const year = Number(label.match(/\d{4}/)?.[0] ?? 0);
  const quarter = Number(label.match(/(\d)분기/)?.[1] ?? 9);
  return [year, quarter];
}

/**
 * 사업보고서 본문에서 뽑은 지표. 정형 API 에 없어 원문 표를 읽어야 하는 것들이다.
 * 표가 없는 회사도 많아, 못 찾은 지표는 카드를 아예 내지 않는다.
 */
export async function BodyMetricsSection({
  reports,
  corpName,
  granularity,
}: {
  reports: PeriodicReport[];
  corpName: string;
  granularity: Granularity;
}) {
  const metrics = await getBodyMetrics(reports);
  // 가동률·가격변동은 사업보고서의 연간 전체 값(quarterIndex 없음)과 분기·반기
  // 보고서의 자기 시점 값(quarterIndex 있음)이 한 배열에 같이 담겨 온다. 토글에
  // 맞는 쪽만 걸러서 쓴다.
  const isQuarterGranularity = granularity === "quarter";
  const utilizationRows = metrics.utilization.filter((row) =>
    isQuarterGranularity ? row.quarterIndex !== null : row.quarterIndex === null,
  );
  const priceChangeRows = metrics.priceChanges
    .map((row) => ({
      ...row,
      values: row.values.filter((value) =>
        isQuarterGranularity ? value.quarterIndex !== null : value.quarterIndex === null,
      ),
    }))
    .filter((row) => row.values.length > 0);
  const utilization = utilizationSeries(utilizationRows);
  // 품목마다 실린 기간이 다를 수 있어, 열은 모아서 만들고 값은 이름으로 찾아 넣는다.
  // 열을 첫 줄에 맞춰 두면 기간이 어긋난 회사에서 다른 해 숫자가 그 자리에 들어간다.
  const priceColumns = [
    ...new Set(priceChangeRows.flatMap((row) => row.values.map(priceColumnName))),
  ].sort();
  const subsidiaryNames = [...new Set(metrics.subsidiaries.map((row) => row.name))];
  const subsidiaryPeriods = [
    ...new Set(metrics.subsidiaries.map((row) => row.periodLabel).filter(Boolean)),
  ].sort((a, b) => {
    const [ay, ah] = periodSortKey(a);
    const [by, bh] = periodSortKey(b);
    return ay - by || ah - bh;
  });
  const subsidiaryCsvRows: Array<Array<string | number | null>> = [
    ["종속회사", "구분", ...subsidiaryPeriods],
    ...subsidiaryNames.flatMap((name) => {
      const find = (period: string) =>
        metrics.subsidiaries.find((item) => item.name === name && item.periodLabel === period);
      return [
        [name, "매출액", ...subsidiaryPeriods.map((period) => find(period)?.revenue ?? "")],
        [name, "순손익", ...subsidiaryPeriods.map((period) => find(period)?.netIncome ?? "")],
      ];
    }),
  ];
  const regionalCsvRows: Array<Array<string | number | null>> = [
    ["기간", "국내", "해외", "해외 비중(%)"],
    ...metrics.regionalSales.map((row) => [
      row.year ? `${row.year}년` : row.label,
      row.domestic,
      row.overseas,
      Number(row.overseasShare.toFixed(1)),
    ]),
  ];
  const utilizationCsvRows: Array<Array<string | number | null>> = [
    ["기간", ...utilization.series.map((item) => item.name)],
    ...utilization.data.map((point) => [
      point.label,
      ...utilization.series.map((item) => point[item.key]),
    ]),
  ];
  const priceCsvRows: Array<Array<string | number | null>> = [
    ["품목", ...priceColumns],
    ...priceChangeRows.map((row) => [
      row.item,
      ...priceColumns.map((column) => {
        const found = row.values.find((value) => priceColumnName(value) === column);
        return found ? (found.value ?? found.text) : "";
      }),
    ]),
  ];
  const backlogCsvRows: Array<Array<string | number | null>> = [
    ["구분", ...(metrics.backlog[0]?.values.map((value) => value.label || "-") ?? [])],
    ...metrics.backlog.map((row) => [row.item, ...row.values.map((value) => value.text)]),
  ];

  const found =
    metrics.utilization.length +
    metrics.regionalSales.length +
    metrics.priceChanges.length +
    metrics.backlog.length +
    metrics.subsidiaries.length;

  if (found === 0) {
    return (
      <Section title="본문 지표" description="사업보고서 본문 표에서 읽습니다.">
        <EmptyState
          message={
            metrics.failed > 0
              ? "사업보고서 원문을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요."
              : "이 회사의 사업보고서에는 가동률·지역별 매출·제품 가격 표가 없습니다."
          }
        />
      </Section>
    );
  }

  return (
    <>
      {metrics.regionalSales.length > 0 && (
        <Section
          title="해외 매출 비중"
          description="지역별 매출 표에서 내수·국내로 적힌 줄을 뺀 나머지를 해외로 봤습니다."
          action={
            <DownloadCsvButton
              filename={`${corpName}_해외_매출_비중.csv`}
              rows={regionalCsvRows}
            />
          }
        >
          <div className="card p-5">
            <MetricChart
              name="해외 매출 비중"
              unit="percent"
              data={metrics.regionalSales.map((row) => ({
                label: row.year ? `${row.year}` : row.label,
                value: row.overseasShare,
              }))}
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-[13px]">
                <thead>
                  <tr className="text-grey-500">
                    <th className="py-2 text-left font-medium">기간</th>
                    <th className="py-2 text-right font-medium">국내</th>
                    <th className="py-2 text-right font-medium">해외</th>
                    <th className="py-2 text-right font-medium">해외 비중</th>
                  </tr>
                </thead>
                <tbody>
                  {[...metrics.regionalSales].reverse().map((row) => (
                    <tr key={row.year ?? row.label} className="border-t border-grey-100">
                      <td className="tnum py-2 font-semibold text-grey-900">
                        {row.year ? `${row.year}년` : row.label}
                      </td>
                      <td className="tnum py-2 text-right text-grey-700">
                        {formatKrw(row.domestic)}
                      </td>
                      <td className="tnum py-2 text-right text-grey-700">
                        {formatKrw(row.overseas)}
                      </td>
                      <td className="tnum py-2 text-right font-semibold text-grey-900">
                        {row.overseasShare.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      {subsidiaryNames.length > 0 && (
        <Section
          title="종속회사 실적"
          description="연결재무제표 주석의 종속기업 요약재무정보입니다. 연결 전체가 아니라 회사별 매출·순손익입니다."
          action={
            <DownloadCsvButton
              filename={`${corpName}_종속회사_실적.csv`}
              rows={subsidiaryCsvRows}
            />
          }
        >
          <div className="card overflow-x-auto p-5">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="text-grey-500">
                  <th className="py-2 text-left font-medium">종속회사</th>
                  {subsidiaryPeriods.map((period) => (
                    <th key={period} className="py-2 text-right font-medium">
                      {period}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={subsidiaryPeriods.length + 1} className="pt-3 pb-1 text-[12px] font-semibold text-grey-500">
                    매출액
                  </td>
                </tr>
                {subsidiaryNames.map((name) => (
                  <tr key={`revenue-${name}`} className="border-t border-grey-100">
                    <td className="py-2 break-keep text-grey-900">{name}</td>
                    {subsidiaryPeriods.map((period) => {
                      const row = metrics.subsidiaries.find(
                        (item) => item.name === name && item.periodLabel === period,
                      );
                      return (
                        <td key={period} className="tnum py-2 text-right text-grey-700">
                          {row?.revenue != null ? formatKrw(row.revenue) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t border-grey-100 text-grey-500">
                  <th className="pt-4 pb-1 text-left text-[12px] font-semibold">순손익</th>
                  {subsidiaryPeriods.map((period) => (
                    <th key={period} className="pt-4 pb-1 text-right font-medium">
                      {period}
                    </th>
                  ))}
                </tr>
                {subsidiaryNames.map((name) => (
                  <tr key={`net-${name}`} className="border-t border-grey-100">
                    <td className="py-2 break-keep text-grey-900">{name}</td>
                    {subsidiaryPeriods.map((period) => {
                      const row = metrics.subsidiaries.find(
                        (item) => item.name === name && item.periodLabel === period,
                      );
                      const value = row?.netIncome ?? null;
                      return (
                        <td
                          key={period}
                          className={`tnum py-2 text-right ${
                            value !== null && value < 0 ? "text-blue-600" : "text-grey-700"
                          }`}
                        >
                          {value != null ? formatKrw(value) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {utilization.series.length > 0 && (
        <Section
          title="가동률"
          description={
            isQuarterGranularity
              ? "사업보고서·반기보고서·분기보고서 &ldquo;생산능력 및 생산실적&rdquo; 표의 그 시점 평균가동률입니다."
              : "사업보고서 &ldquo;생산능력 및 생산실적&rdquo; 표의 평균가동률입니다."
          }
          action={
            <DownloadCsvButton
              filename={`${corpName}_가동률.csv`}
              rows={utilizationCsvRows}
            />
          }
        >
          <div className="card p-5">
            {utilization.data.length > 1 ? (
              <MultiLineChart
                unit="percent"
                data={utilization.data}
                series={utilization.series.map((item, index) => ({
                  ...item,
                  color: compareColor(index),
                }))}
              />
            ) : (
              <ul className="space-y-2">
                {utilizationRows.map((row) => (
                  <li
                    key={`${row.segment}-${row.item}-${row.year}`}
                    className="flex items-baseline justify-between gap-4 border-b border-grey-100 pb-2 last:border-0"
                  >
                    <span className="text-[14px] break-keep text-grey-700">
                      {row.segment && row.segment !== row.item && (
                        <span className="mr-1.5 text-grey-500">{row.segment}</span>
                      )}
                      {row.item}
                    </span>
                    <span className="tnum text-[15px] font-bold text-grey-900">
                      {row.rate.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {utilization.data.length <= 1 && (
              <p className="mt-3 text-[13px] text-grey-500">
                이 회사는 이 시점의 가동률만 실어 추이를 그리지 못했습니다.
              </p>
            )}
          </div>
        </Section>
      )}

      {priceColumns.length > 0 && (
        <Section
          title="제품 가격변동 추이"
          description="회사에 따라 단가를 숫자로, 또는 전년 대비 증감을 글로 싣습니다. 숫자로 실은 품목은 직전 기간 대비 증감률도 함께 보여줍니다."
          action={
            <DownloadCsvButton filename={`${corpName}_제품_가격변동.csv`} rows={priceCsvRows} />
          }
        >
          <div className="card overflow-x-auto p-5">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-grey-500">
                  <th className="sticky left-0 z-10 min-w-[120px] bg-white py-2 pr-4 text-left font-medium">
                    품목
                  </th>
                  {priceColumns.map((column) => (
                    <th
                      key={column}
                      className="min-w-[110px] border-l border-grey-100 px-3 py-2 text-right font-medium whitespace-nowrap"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priceChangeRows.map((row, rowIndex) => {
                  const zebra = rowIndex % 2 === 1;
                  const cells = priceColumns.map(
                    (column) =>
                      row.values.find((value) => priceColumnName(value) === column) ?? null,
                  );
                  return (
                    <tr
                      key={row.item}
                      className={`border-t border-grey-100 ${zebra ? "bg-grey-50" : ""}`}
                    >
                      <td
                        className={`sticky left-0 z-10 py-3 pr-4 font-semibold break-keep text-grey-900 ${
                          zebra ? "bg-grey-50" : "bg-white"
                        }`}
                      >
                        {row.item}
                      </td>
                      {cells.map((cell, index) => {
                        const previous = cells
                          .slice(0, index)
                          .reverse()
                          .find((item) => item?.value != null);
                        const delta =
                          cell?.value != null && previous?.value
                            ? ((cell.value - previous.value) / previous.value) * 100
                            : null;
                        return (
                          <td
                            key={priceColumns[index]}
                            className="tnum border-l border-grey-100 px-3 py-3 text-right break-keep text-grey-700"
                          >
                            <div className="flex flex-col items-end gap-1">
                              <span>{cell ? cell.text : "—"}</span>
                              {delta !== null && <DeltaBadge value={Number(delta.toFixed(1))} />}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {metrics.backlog.length > 0 && (
        <Section
          title="수주잔고"
          description="수주산업만 사업보고서에 싣습니다."
          action={
            <DownloadCsvButton filename={`${corpName}_수주잔고.csv`} rows={backlogCsvRows} />
          }
        >
          <div className="card overflow-x-auto p-5">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="text-grey-500">
                  <th className="py-2 text-left font-medium">구분</th>
                  {metrics.backlog[0].values.map((value, index) => (
                    <th key={index} className="py-2 text-right font-medium">
                      {value.label || "-"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.backlog.map((row) => (
                  <tr key={row.item} className="border-t border-grey-100">
                    <td className="py-2 font-semibold break-keep text-grey-900">{row.item}</td>
                    {row.values.map((value, index) => (
                      <td key={index} className="tnum py-2 text-right text-grey-700">
                        {value.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {metrics.sources.length > 0 && (
        <p className="mt-4 px-1 text-[13px] leading-relaxed text-grey-500">
          출처{" "}
          {metrics.sources.map((source, index) => (
            <span key={source.rceptNo}>
              {index > 0 && ", "}
              <a
                href={source.viewerUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-600 hover:underline"
              >
                {source.fiscalYear} 사업보고서
              </a>
            </span>
          ))}
          . 회사가 표에 적은 값을 그대로 옮겼습니다.
        </p>
      )}
    </>
  );
}

export function BodyMetricsSkeleton() {
  return (
    <section className="mt-10">
      <div className="mb-3 h-6 w-28 animate-pulse rounded-md bg-grey-100" />
      <div className="h-64 animate-pulse rounded-2xl bg-grey-100" />
    </section>
  );
}
