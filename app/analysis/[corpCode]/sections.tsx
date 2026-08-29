import { MetricChart, MultiLineChart } from "@/components/FinancialCharts";
import { EmptyState, Section } from "@/components/ui";
import { compareColor } from "@/lib/compare";
import { formatKrw } from "@/lib/format";
import { getBodyMetrics, utilizationSeries } from "@/lib/report-analysis";
import type { PeriodicReport } from "@/lib/reports";

function priceColumnName(value: { year: number | null; label: string }): string {
  return value.year ? `${value.year}년` : value.label;
}

/**
 * 사업보고서 본문에서 뽑은 지표. 정형 API 에 없어 원문 표를 읽어야 하는 것들이다.
 * 표가 없는 회사도 많아, 못 찾은 지표는 카드를 아예 내지 않는다.
 */
export async function BodyMetricsSection({ reports }: { reports: PeriodicReport[] }) {
  const metrics = await getBodyMetrics(reports);
  const utilization = utilizationSeries(metrics.utilization);
  // 품목마다 실린 기간이 다를 수 있어, 열은 모아서 만들고 값은 이름으로 찾아 넣는다.
  // 열을 첫 줄에 맞춰 두면 기간이 어긋난 회사에서 다른 해 숫자가 그 자리에 들어간다.
  const priceColumns = [
    ...new Set(metrics.priceChanges.flatMap((row) => row.values.map(priceColumnName))),
  ].sort();
  const found =
    metrics.utilization.length +
    metrics.regionalSales.length +
    metrics.priceChanges.length +
    metrics.backlog.length;

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

      {utilization.series.length > 0 && (
        <Section
          title="가동률"
          description="사업보고서 &ldquo;생산능력 및 생산실적&rdquo; 표의 평균가동률입니다."
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
                {metrics.utilization.map((row) => (
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
                이 회사는 사업보고서에 당기 가동률만 실어 추이를 그리지 못했습니다.
              </p>
            )}
          </div>
        </Section>
      )}

      {priceColumns.length > 0 && (
        <Section
          title="제품 가격변동 추이"
          description="회사에 따라 단가를 숫자로, 또는 전년 대비 증감을 글로 싣습니다."
        >
          <div className="card overflow-x-auto p-5">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="text-grey-500">
                  <th className="py-2 text-left font-medium">품목</th>
                  {priceColumns.map((column) => (
                    <th key={column} className="py-2 text-right font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.priceChanges.map((row) => (
                  <tr key={row.item} className="border-t border-grey-100">
                    <td className="py-2 font-semibold break-keep text-grey-900">{row.item}</td>
                    {priceColumns.map((column) => (
                      <td
                        key={column}
                        className="tnum py-2 text-right break-keep text-grey-700"
                      >
                        {row.values.find((value) => priceColumnName(value) === column)?.text ??
                          "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {metrics.backlog.length > 0 && (
        <Section title="수주잔고" description="수주산업만 사업보고서에 싣습니다.">
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
