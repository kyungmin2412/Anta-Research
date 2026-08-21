import Link from "next/link";
import { PerformanceChart, RatioChart } from "@/components/FinancialCharts";
import { DeltaBadge, EmptyState, Section, StatTile } from "@/components/ui";
import {
  getAffiliates,
  getDisclosures,
  getEmployees,
  getMajorShareholders,
  latestReport,
  parseCount,
} from "@/lib/company";
import { dartViewerUrl } from "@/lib/dart";
import {
  computeRatios,
  getFinancialSeries,
  getSeparateSnapshot,
  type Granularity,
} from "@/lib/finance";
import {
  formatDartDate,
  formatKrw,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from "@/lib/format";

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-grey-100 ${className}`} />;
}

export function FinancialsSkeleton() {
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card p-5">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="mt-3 h-6 w-24" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>
      <Section title="실적 흐름" description="불러오는 중이에요">
        <div className="card p-5">
          <Skeleton className="h-[280px] w-full" />
        </div>
      </Section>
    </>
  );
}

export function ListSkeleton({ title, rows = 3 }: { title: string; rows?: number }) {
  return (
    <Section title={title} description="불러오는 중이에요">
      <div className="card divide-y divide-grey-100">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="px-5 py-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
    </Section>
  );
}

export async function FinancialsSection({
  corpCode,
  granularity,
}: {
  corpCode: string;
  granularity: Granularity;
}) {
  const series = await getFinancialSeries(corpCode, granularity);
  const latest = series.periods.at(-1);
  const isQuarter = granularity === "quarter";

  if (!latest) {
    return (
      <div className="mt-4">
        <EmptyState
          message={
            isQuarter
              ? "분기보고서 재무제표를 찾지 못했어요. 분기 공시 의무가 없는 법인일 수 있습니다."
              : "사업보고서 재무제표를 찾지 못했어요. 비상장 법인이거나 아직 공시된 재무 데이터가 없을 수 있습니다."
          }
        />
      </div>
    );
  }

  const ratios = computeRatios(latest, series.periods.at(-2));
  const periodUnit = isQuarter ? "분기" : "연도";
  const growthLabel = isQuarter ? "직전 분기 대비" : "전년 대비";

  const performanceData = series.periods.map((period) => ({
    label: period.label,
    revenue: period.revenue,
    operatingIncome: period.operatingIncome,
    netIncome: period.netIncome,
  }));

  const ratioData = series.periods.map((period, index) => {
    const computed = computeRatios(period, series.periods[index - 1]);
    return {
      label: period.label,
      operatingMargin: computed.operatingMargin,
      netMargin: computed.netMargin,
      roe: computed.roe,
    };
  });

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={`매출액 (${latest.label})`}
          value={formatKrw(latest.revenue)}
          sub={
            ratios.revenueGrowth !== null
              ? `${growthLabel} ${formatSignedPercent(ratios.revenueGrowth)}`
              : undefined
          }
        />
        <StatTile
          label="영업이익"
          value={formatKrw(latest.operatingIncome)}
          sub={
            ratios.operatingMargin !== null
              ? `영업이익률 ${formatPercent(ratios.operatingMargin)}`
              : undefined
          }
          tone={
            latest.operatingIncome === null
              ? "default"
              : latest.operatingIncome >= 0
                ? "up"
                : "down"
          }
        />
        <StatTile
          label={isQuarter ? "분기순이익" : "당기순이익"}
          value={formatKrw(latest.netIncome)}
          sub={
            ratios.netMargin !== null
              ? `순이익률 ${formatPercent(ratios.netMargin)}`
              : undefined
          }
          tone={
            latest.netIncome === null ? "default" : latest.netIncome >= 0 ? "up" : "down"
          }
        />
        <StatTile
          label="자산총계"
          value={formatKrw(latest.assets)}
          sub={`자본총계 ${formatKrw(latest.equity)}`}
        />
      </div>

      <Section
        title="실적 흐름"
        description={`최근 ${series.periods.length}개 ${periodUnit} · ${
          series.fsDiv === "CFS" ? "연결재무제표" : "별도재무제표"
        } · 단위 원`}
      >
        <div className="card p-5 pt-6">
          <PerformanceChart
            data={performanceData}
            netLabel={isQuarter ? "분기순이익" : "당기순이익"}
          />
        </div>
        {isQuarter && (
          <p className="mt-2.5 px-1 text-[12px] leading-relaxed break-keep text-grey-500">
            분기 손익과 현금흐름은 공시된 누적 금액에서 직전 분기 누적을 뺀 값입니다.
            회사가 수정 공시를 하면 원문과 차이가 날 수 있습니다.
          </p>
        )}
      </Section>

      <Section title="수익성" description="매출에서 얼마를 남기는지 보여줍니다.">
        <div className="card p-5 pt-6">
          <RatioChart data={ratioData} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="영업이익률" value={formatPercent(ratios.operatingMargin)} />
          <StatTile label="순이익률" value={formatPercent(ratios.netMargin)} />
          <StatTile
            label="ROE"
            value={formatPercent(ratios.roe)}
            sub={isQuarter ? "분기 순이익 기준" : "자기자본이익률"}
          />
          <StatTile
            label="ROA"
            value={formatPercent(ratios.roa)}
            sub={isQuarter ? "분기 순이익 기준" : "총자산이익률"}
          />
        </div>
      </Section>

      <Section title="재무 안정성" description="빚을 감당할 수 있는 체력을 봅니다.">
        <div className="card p-6">
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-[13px] font-medium text-grey-500">부채비율</p>
              <p className="tnum mt-1.5 text-[24px] font-bold text-grey-900">
                {formatPercent(ratios.debtRatio)}
              </p>
              <p className="mt-1 text-[12px] break-keep text-grey-500">
                100% 이하면 자본이 부채보다 많습니다
              </p>
            </div>
            <div>
              <p className="text-[13px] font-medium text-grey-500">유동비율</p>
              <p className="tnum mt-1.5 text-[24px] font-bold text-grey-900">
                {formatPercent(ratios.currentRatio)}
              </p>
              <p className="mt-1 text-[12px] break-keep text-grey-500">
                200% 이상이면 단기 지급 여력이 넉넉합니다
              </p>
            </div>
            <div>
              <p className="text-[13px] font-medium text-grey-500">자기자본비율</p>
              <p className="tnum mt-1.5 text-[24px] font-bold text-grey-900">
                {formatPercent(ratios.equityRatio)}
              </p>
              <p className="mt-1 text-[12px] break-keep text-grey-500">
                자산 중 내 돈으로 마련한 비중입니다
              </p>
            </div>
          </div>

          {latest.assets && latest.liabilities !== null && latest.equity !== null && (
            <div className="mt-7">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-grey-100">
                <div
                  className="bg-blue-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, (latest.equity / latest.assets) * 100))}%`,
                  }}
                />
                <div
                  className="bg-grey-300"
                  style={{
                    width: `${Math.max(0, Math.min(100, (latest.liabilities / latest.assets) * 100))}%`,
                  }}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-grey-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  자본 {formatKrw(latest.equity)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-grey-300" />
                  부채 {formatKrw(latest.liabilities)}
                </span>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="현금흐름" description={`${latest.label} 기준`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="영업활동"
            value={formatKrw(latest.operatingCashFlow)}
            sub="본업으로 벌어들인 현금"
          />
          <StatTile
            label="투자활동"
            value={formatKrw(latest.investingCashFlow)}
            sub="설비·지분 투자에 쓴 현금"
          />
          <StatTile
            label="재무활동"
            value={formatKrw(latest.financingCashFlow)}
            sub="차입·배당으로 오간 현금"
          />
        </div>
      </Section>

      <Section title={`${periodUnit}별 재무 요약`} description="단위: 원">
        <div className="card thin-scroll overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead>
              <tr className="border-b border-grey-100">
                <th className="px-5 py-3.5 text-left text-[13px] font-semibold text-grey-500">
                  항목
                </th>
                {series.periods.map((period) => (
                  <th
                    key={period.label}
                    className="tnum px-5 py-3.5 text-right text-[13px] font-semibold whitespace-nowrap text-grey-500"
                  >
                    {period.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["매출액", "revenue"],
                  ["영업이익", "operatingIncome"],
                  [isQuarter ? "분기순이익" : "당기순이익", "netIncome"],
                  ["자산총계", "assets"],
                  ["부채총계", "liabilities"],
                  ["자본총계", "equity"],
                ] as const
              ).map(([label, key]) => (
                <tr key={key} className="border-b border-grey-100 last:border-b-0">
                  <td className="px-5 py-3.5 text-[14px] font-medium whitespace-nowrap text-grey-800">
                    {label}
                  </td>
                  {series.periods.map((period) => (
                    <td
                      key={period.label}
                      className="tnum px-5 py-3.5 text-right text-[14px] whitespace-nowrap text-grey-700"
                    >
                      {formatKrw(period[key])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-grey-50">
                <td className="px-5 py-3.5 text-[14px] font-medium whitespace-nowrap text-grey-800">
                  매출 증감률
                </td>
                {series.periods.map((period, index) => (
                  <td key={period.label} className="px-5 py-3.5 text-right">
                    <DeltaBadge
                      value={computeRatios(period, series.periods[index - 1]).revenueGrowth}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

export async function AffiliatesSection({ corpCode }: { corpCode: string }) {
  const [affiliates, separate] = await Promise.all([
    latestReport((year) => getAffiliates(corpCode, year)),
    getSeparateSnapshot(corpCode).catch(() => null),
  ]);

  if (affiliates.rows.length === 0 && !separate) return null;

  const subsidiaries = affiliates.rows.filter(
    (row) => (row.ownershipRate ?? 0) > 50,
  ).length;

  return (
    <>
      {separate?.consolidated && separate.separate && (
        <Section
          title="연결 vs 별도"
          description={`${separate.year} 사업연도 · 자회사가 실적에 얼마나 보태는지 봅니다.`}
        >
          <div className="card thin-scroll overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 560 }}>
              <thead>
                <tr className="border-b border-grey-100">
                  <th className="px-5 py-3.5 text-left text-[13px] font-semibold text-grey-500">
                    항목
                  </th>
                  <th className="px-5 py-3.5 text-right text-[13px] font-semibold text-grey-500">
                    연결 (자회사 포함)
                  </th>
                  <th className="px-5 py-3.5 text-right text-[13px] font-semibold text-grey-500">
                    별도 (본사만)
                  </th>
                  <th className="px-5 py-3.5 text-right text-[13px] font-semibold text-grey-500">
                    차이
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["매출액", "revenue"],
                    ["영업이익", "operatingIncome"],
                    ["당기순이익", "netIncome"],
                    ["자산총계", "assets"],
                  ] as const
                ).map(([label, key]) => {
                  const cfs = separate.consolidated![key];
                  const ofs = separate.separate![key];
                  const gap = cfs !== null && ofs !== null ? cfs - ofs : null;
                  const share =
                    cfs !== null && gap !== null && cfs !== 0 ? (gap / cfs) * 100 : null;
                  return (
                    <tr key={key} className="border-b border-grey-100 last:border-b-0">
                      <td className="px-5 py-3.5 text-[14px] font-medium whitespace-nowrap text-grey-800">
                        {label}
                      </td>
                      <td className="tnum px-5 py-3.5 text-right text-[14px] whitespace-nowrap text-grey-700">
                        {formatKrw(cfs)}
                      </td>
                      <td className="tnum px-5 py-3.5 text-right text-[14px] whitespace-nowrap text-grey-700">
                        {formatKrw(ofs)}
                      </td>
                      <td className="tnum px-5 py-3.5 text-right text-[14px] font-semibold whitespace-nowrap text-grey-900">
                        {formatKrw(gap)}
                        {share !== null && (
                          <span className="ml-1.5 text-[12px] font-medium text-grey-500">
                            {formatPercent(share, 0)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 px-1 text-[12px] leading-relaxed break-keep text-grey-500">
            차이는 연결에서 별도를 뺀 값으로, 자회사가 더한 몫에 가깝습니다. 내부거래
            제거 효과가 섞여 있어 자회사 실적 합계와 정확히 같지는 않습니다.
          </p>
        </Section>
      )}

      {affiliates.rows.length > 0 && (
        <Section
          title="출자 법인"
          description={`${affiliates.year} 사업보고서 기준 · ${affiliates.rows.length}곳${
            subsidiaries > 0 ? ` (지분 50% 초과 ${subsidiaries}곳)` : ""
          }`}
        >
          <div className="card thin-scroll overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 680 }}>
              <thead>
                <tr className="border-b border-grey-100">
                  <th className="px-5 py-3.5 text-left text-[13px] font-semibold text-grey-500">
                    법인명
                  </th>
                  <th className="px-5 py-3.5 text-right text-[13px] font-semibold text-grey-500">
                    지분율
                  </th>
                  <th className="px-5 py-3.5 text-right text-[13px] font-semibold text-grey-500">
                    장부가액
                  </th>
                  <th className="px-5 py-3.5 text-right text-[13px] font-semibold text-grey-500">
                    총자산
                  </th>
                  <th className="px-5 py-3.5 text-right text-[13px] font-semibold text-grey-500">
                    당기순손익
                  </th>
                </tr>
              </thead>
              <tbody>
                {affiliates.rows.map((row, index) => (
                  <tr
                    key={`${row.name}-${index}`}
                    className="border-b border-grey-100 last:border-b-0"
                  >
                    <td className="px-5 py-3.5 text-[14px] font-medium text-grey-800">
                      <span className="flex items-center gap-2">
                        {row.corpCode ? (
                          <Link
                            href={`/company/${row.corpCode}`}
                            className="text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            {row.name}
                          </Link>
                        ) : (
                          row.name
                        )}
                        {(row.ownershipRate ?? 0) > 50 && (
                          <span className="shrink-0 rounded-md bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">
                            종속
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="tnum px-5 py-3.5 text-right text-[14px] font-semibold whitespace-nowrap text-grey-900">
                      {row.ownershipRate !== null
                        ? `${row.ownershipRate.toFixed(2)}%`
                        : "—"}
                    </td>
                    <td className="tnum px-5 py-3.5 text-right text-[14px] whitespace-nowrap text-grey-700">
                      {formatKrw(row.bookValue)}
                    </td>
                    <td className="tnum px-5 py-3.5 text-right text-[14px] whitespace-nowrap text-grey-700">
                      {formatKrw(row.totalAssets)}
                    </td>
                    <td
                      className={`tnum px-5 py-3.5 text-right text-[14px] whitespace-nowrap ${
                        (row.netIncome ?? 0) < 0 ? "text-blue-600" : "text-grey-700"
                      }`}
                    >
                      {formatKrw(row.netIncome)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 px-1 text-[12px] leading-relaxed break-keep text-grey-500">
            DART 타법인 출자현황 공시입니다. 파란 이름을 누르면 그 법인의 분석 화면으로
            넘어갑니다.
          </p>
        </Section>
      )}
    </>
  );
}

export async function OwnershipSection({ corpCode }: { corpCode: string }) {
  const [shareholders, employees] = await Promise.all([
    latestReport((year) => getMajorShareholders(corpCode, year)),
    latestReport((year) => getEmployees(corpCode, year)),
  ]);

  const totalEmployees = employees.rows.reduce(
    (sum, row) => sum + (parseCount(row.sm) ?? 0),
    0,
  );
  const salaries = employees.rows
    .map((row) => parseCount(row.jan_salary_am))
    .filter((value): value is number => value !== null);
  const meanSalary =
    salaries.length > 0
      ? salaries.reduce((sum, value) => sum + value, 0) / salaries.length
      : null;

  return (
    <>
      {shareholders.rows.length > 0 && (
        <Section
          title="최대주주 현황"
          description={`${shareholders.year} 사업보고서 기준`}
        >
          <div className="card thin-scroll overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 560 }}>
              <thead>
                <tr className="border-b border-grey-100">
                  <th className="px-5 py-3.5 text-left text-[13px] font-semibold text-grey-500">
                    성명
                  </th>
                  <th className="px-5 py-3.5 text-left text-[13px] font-semibold text-grey-500">
                    관계
                  </th>
                  <th className="px-5 py-3.5 text-right text-[13px] font-semibold text-grey-500">
                    보유주식수
                  </th>
                  <th className="px-5 py-3.5 text-right text-[13px] font-semibold text-grey-500">
                    지분율
                  </th>
                </tr>
              </thead>
              <tbody>
                {shareholders.rows.slice(0, 10).map((row, index) => (
                  <tr
                    key={`${row.nm}-${index}`}
                    className="border-b border-grey-100 last:border-b-0"
                  >
                    <td className="px-5 py-3.5 text-[14px] font-medium text-grey-800">
                      {row.nm}
                    </td>
                    <td className="px-5 py-3.5 text-[14px] text-grey-600">
                      {row.relate || "—"}
                    </td>
                    <td className="tnum px-5 py-3.5 text-right text-[14px] text-grey-700">
                      {formatNumber(parseCount(row.trmend_posesn_stock_co))}
                    </td>
                    <td className="tnum px-5 py-3.5 text-right text-[14px] font-semibold text-grey-900">
                      {row.trmend_posesn_stock_qota_rt
                        ? `${row.trmend_posesn_stock_qota_rt}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {totalEmployees > 0 && (
        <Section title="직원 현황" description={`${employees.year} 사업보고서 기준`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile label="전체 직원 수" value={`${formatNumber(totalEmployees)}명`} />
            <StatTile
              label="1인 평균 급여액"
              value={meanSalary ? formatKrw(meanSalary) : "—"}
              sub="공시된 부문 평균"
            />
          </div>
        </Section>
      )}
    </>
  );
}

export async function DisclosureSection({ corpCode }: { corpCode: string }) {
  const disclosures = await getDisclosures(corpCode).catch(() => []);

  return (
    <Section
      title="최근 공시"
      description="최근 1년간 제출된 공시입니다."
      action={
        <a
          href="https://dart.fss.or.kr/dsab007/main.do"
          target="_blank"
          rel="noreferrer"
          className="text-[13px] font-semibold text-blue-600 hover:text-blue-700"
        >
          DART에서 보기
        </a>
      }
    >
      {disclosures.length === 0 ? (
        <EmptyState message="최근 1년간 제출된 공시가 없어요." />
      ) : (
        <ul className="card divide-y divide-grey-100">
          {disclosures.map((item) => (
            <li key={item.rcept_no}>
              <a
                href={dartViewerUrl(item.rcept_no)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-grey-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium text-grey-900">
                    {item.report_nm.trim()}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-grey-500">
                    {item.flr_nm}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[13px] text-grey-500">
                  {formatDartDate(item.rcept_dt)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
