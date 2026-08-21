import Link from "next/link";
import { notFound } from "next/navigation";
import { PerformanceChart, RatioChart } from "@/components/FinancialCharts";
import { DeltaBadge, EmptyState, InfoRow, Section, StatTile } from "@/components/ui";
import {
  CORP_CLASS_LABEL,
  getCompanyProfile,
  getDisclosures,
  getEmployees,
  getMajorShareholders,
  parseCount,
  type CompanyProfile,
} from "@/lib/company";
import { DartError, dartViewerUrl } from "@/lib/dart";
import { computeRatios, getFinancialSeries } from "@/lib/finance";
import {
  formatDartDate,
  formatKrw,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from "@/lib/format";

export const revalidate = 3600;

type PageProps = { params: Promise<{ corpCode: string }> };

export async function generateMetadata({ params }: PageProps) {
  const { corpCode } = await params;
  try {
    const profile = await getCompanyProfile(corpCode);
    return {
      title: `${profile.corp_name} 기업분석 — Anta Research`,
      description: `${profile.corp_name}의 매출, 영업이익, 재무비율과 최근 공시를 DART 데이터로 확인하세요.`,
    };
  } catch {
    return { title: "기업분석 — Anta Research" };
  }
}

export default async function CompanyPage({ params }: PageProps) {
  const { corpCode } = await params;
  if (!/^\d{8}$/.test(corpCode)) notFound();

  let profile: CompanyProfile;
  try {
    profile = await getCompanyProfile(corpCode);
  } catch (error) {
    if (error instanceof DartError && error.status === "013") notFound();
    throw error;
  }

  const [series, disclosures] = await Promise.all([
    getFinancialSeries(corpCode),
    getDisclosures(corpCode).catch(() => []),
  ]);

  const latest = series.years.at(-1) ?? null;
  const previous = series.years.at(-2) ?? undefined;
  const ratios = latest ? computeRatios(latest, previous) : null;
  const reportYear = latest?.year;

  const [shareholders, employees] = await Promise.all([
    reportYear ? getMajorShareholders(corpCode, reportYear).catch(() => []) : [],
    reportYear ? getEmployees(corpCode, reportYear).catch(() => []) : [],
  ]);

  const performanceData = series.years.map((year) => ({
    year: `${year.year}`,
    revenue: year.revenue,
    operatingIncome: year.operatingIncome,
    netIncome: year.netIncome,
  }));

  const ratioData = series.years.map((year, index) => {
    const computed = computeRatios(year, series.years[index - 1]);
    return {
      year: `${year.year}`,
      operatingMargin: computed.operatingMargin,
      netMargin: computed.netMargin,
      roe: computed.roe,
    };
  });

  const totalEmployees = employees.reduce(
    (sum, row) => sum + (parseCount(row.sm) ?? 0),
    0,
  );
  const avgSalary = employees
    .map((row) => parseCount(row.jan_salary_am))
    .filter((value): value is number => value !== null);
  const meanSalary =
    avgSalary.length > 0
      ? avgSalary.reduce((sum, value) => sum + value, 0) / avgSalary.length
      : null;

  const marketLabel = CORP_CLASS_LABEL[profile.corp_cls] ?? "기타";

  return (
    <div className="animate-fade-up pt-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-grey-500 hover:text-grey-700"
      >
        ← 검색으로 돌아가기
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-blue-100 px-2 py-1 text-[12px] font-semibold text-blue-700">
              {marketLabel}
            </span>
            {profile.stock_code && (
              <span className="tnum rounded-md bg-grey-100 px-2 py-1 text-[12px] font-semibold text-grey-600">
                {profile.stock_code}
              </span>
            )}
            {series.fsDiv && (
              <span className="rounded-md bg-grey-100 px-2 py-1 text-[12px] font-medium text-grey-600">
                {series.fsDiv === "CFS" ? "연결재무제표" : "별도재무제표"}
              </span>
            )}
          </div>
          <h1 className="mt-3 text-[30px] leading-tight font-bold text-grey-900 sm:text-[36px]">
            {profile.corp_name}
          </h1>
          <p className="mt-1 text-[14px] text-grey-500">
            {profile.corp_name_eng || profile.stock_name || "—"}
          </p>
        </div>
        {profile.hm_url && (
          <a
            href={
              profile.hm_url.startsWith("http")
                ? profile.hm_url
                : `https://${profile.hm_url}`
            }
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-grey-700 shadow-card ring-1 ring-grey-100 hover:bg-grey-100"
          >
            홈페이지 방문
          </a>
        )}
      </header>

      {latest ? (
        <>
          <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label={`매출액 (${latest.year})`}
              value={formatKrw(latest.revenue)}
              sub={
                ratios?.revenueGrowth !== null && ratios?.revenueGrowth !== undefined
                  ? `전년 대비 ${formatSignedPercent(ratios.revenueGrowth)}`
                  : undefined
              }
            />
            <StatTile
              label="영업이익"
              value={formatKrw(latest.operatingIncome)}
              sub={
                ratios?.operatingMargin !== null && ratios?.operatingMargin !== undefined
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
              label="당기순이익"
              value={formatKrw(latest.netIncome)}
              sub={
                ratios?.netMargin !== null && ratios?.netMargin !== undefined
                  ? `순이익률 ${formatPercent(ratios.netMargin)}`
                  : undefined
              }
              tone={
                latest.netIncome === null
                  ? "default"
                  : latest.netIncome >= 0
                    ? "up"
                    : "down"
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
            description={`최근 ${series.years.length}개 사업연도 · 단위 원`}
          >
            <div className="card p-5 pt-6">
              <PerformanceChart data={performanceData} />
            </div>
          </Section>

          <Section title="수익성" description="매출에서 얼마를 남기는지 보여줍니다.">
            <div className="card p-5 pt-6">
              <RatioChart data={ratioData} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="영업이익률" value={formatPercent(ratios?.operatingMargin)} />
              <StatTile label="순이익률" value={formatPercent(ratios?.netMargin)} />
              <StatTile label="ROE" value={formatPercent(ratios?.roe)} sub="자기자본이익률" />
              <StatTile label="ROA" value={formatPercent(ratios?.roa)} sub="총자산이익률" />
            </div>
          </Section>

          <Section title="재무 안정성" description="빚을 감당할 수 있는 체력을 봅니다.">
            <div className="card p-6">
              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="text-[13px] font-medium text-grey-500">부채비율</p>
                  <p className="tnum mt-1.5 text-[24px] font-bold text-grey-900">
                    {formatPercent(ratios?.debtRatio)}
                  </p>
                  <p className="mt-1 text-[12px] text-grey-500">
                    100% 이하면 자본이 부채보다 많습니다
                  </p>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-grey-500">유동비율</p>
                  <p className="tnum mt-1.5 text-[24px] font-bold text-grey-900">
                    {formatPercent(ratios?.currentRatio)}
                  </p>
                  <p className="mt-1 text-[12px] text-grey-500">
                    200% 이상이면 단기 지급 여력이 넉넉합니다
                  </p>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-grey-500">자기자본비율</p>
                  <p className="tnum mt-1.5 text-[24px] font-bold text-grey-900">
                    {formatPercent(ratios?.equityRatio)}
                  </p>
                  <p className="mt-1 text-[12px] text-grey-500">
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

          <Section title="현금흐름" description={`${latest.year} 사업연도 기준`}>
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

          <Section title="연도별 재무 요약" description="단위: 원">
            <div className="card overflow-x-auto thin-scroll">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b border-grey-100">
                    <th className="px-5 py-3.5 text-left text-[13px] font-semibold text-grey-500">
                      항목
                    </th>
                    {series.years.map((year) => (
                      <th
                        key={year.year}
                        className="tnum px-5 py-3.5 text-right text-[13px] font-semibold text-grey-500"
                      >
                        {year.year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["매출액", "revenue"],
                      ["영업이익", "operatingIncome"],
                      ["당기순이익", "netIncome"],
                      ["자산총계", "assets"],
                      ["부채총계", "liabilities"],
                      ["자본총계", "equity"],
                    ] as const
                  ).map(([label, key]) => (
                    <tr key={key} className="border-b border-grey-100 last:border-b-0">
                      <td className="px-5 py-3.5 text-[14px] font-medium text-grey-800">
                        {label}
                      </td>
                      {series.years.map((year) => (
                        <td
                          key={year.year}
                          className="tnum px-5 py-3.5 text-right text-[14px] text-grey-700"
                        >
                          {formatKrw(year[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-grey-50">
                    <td className="px-5 py-3.5 text-[14px] font-medium text-grey-800">
                      매출 성장률
                    </td>
                    {series.years.map((year, index) => {
                      const computed = computeRatios(year, series.years[index - 1]);
                      return (
                        <td key={year.year} className="px-5 py-3.5 text-right">
                          <DeltaBadge value={computed.revenueGrowth} />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
        </>
      ) : (
        <div className="mt-7">
          <EmptyState message="이 회사의 사업보고서 재무제표를 찾지 못했어요. 비상장 법인이거나 아직 공시된 재무 데이터가 없을 수 있습니다." />
        </div>
      )}

      <Section title="기업 개요">
        <div className="card">
          <InfoRow label="대표자">{profile.ceo_nm || "—"}</InfoRow>
          <InfoRow label="설립일">{formatDartDate(profile.est_dt)}</InfoRow>
          <InfoRow label="업종코드">{profile.induty_code || "—"}</InfoRow>
          <InfoRow label="결산월">
            {profile.acc_mt ? `${Number(profile.acc_mt)}월` : "—"}
          </InfoRow>
          <InfoRow label="사업자등록번호">{profile.bizr_no || "—"}</InfoRow>
          <InfoRow label="주소">{profile.adres || "—"}</InfoRow>
          <InfoRow label="전화">{profile.phn_no || "—"}</InfoRow>
        </div>
      </Section>

      {shareholders.length > 0 && (
        <Section title="최대주주 현황" description={`${reportYear} 사업보고서 기준`}>
          <div className="card overflow-x-auto thin-scroll">
            <table className="w-full min-w-[560px] border-collapse">
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
                {shareholders.slice(0, 10).map((row, index) => (
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
        <Section title="직원 현황" description={`${reportYear} 사업보고서 기준`}>
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

      <Section
        title="최근 공시"
        description="최근 1년간 제출된 공시입니다."
        action={
          profile.stock_code ? (
            <a
              href={`https://dart.fss.or.kr/dsab007/main.do`}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] font-semibold text-blue-600 hover:text-blue-700"
            >
              DART에서 보기
            </a>
          ) : undefined
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
    </div>
  );
}
