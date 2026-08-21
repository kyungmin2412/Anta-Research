import { Suspense } from "react";
import Link from "next/link";
import ComparePicker from "@/components/ComparePicker";
import { MultiLineChart } from "@/components/FinancialCharts";
import { EmptyState, Section, SegmentedTabs } from "@/components/ui";
import { getCompanyProfile } from "@/lib/company";
import { compareColor, MAX_COMPARE } from "@/lib/compare";
import {
  computeRatios,
  getFinancialSeries,
  type FinancialSeries,
  type Granularity,
} from "@/lib/finance";
import { formatKrw, formatPercent } from "@/lib/format";

export const revalidate = 3600;

export const metadata = {
  title: "기업 비교 — Anta Research",
  description: "여러 기업의 매출, 영업이익률, 부채비율을 나란히 놓고 비교하세요.",
};

type PageProps = {
  searchParams: Promise<{ codes?: string; p?: string }>;
};

function parseCodes(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const code of raw.split(",")) {
    const trimmed = code.trim();
    if (/^\d{8}$/.test(trimmed)) seen.add(trimmed);
    if (seen.size >= MAX_COMPARE) break;
  }
  return [...seen];
}

function compareHref(codes: string[], granularity: Granularity): string {
  if (codes.length === 0) return granularity === "quarter" ? "/compare?p=q" : "/compare";
  const suffix = granularity === "quarter" ? "&p=q" : "";
  return `/compare?codes=${codes.join(",")}${suffix}`;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const codes = parseCodes(params.codes);
  const granularity: Granularity = params.p === "q" ? "quarter" : "annual";

  return (
    <div className="animate-fade-up pt-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-grey-500 hover:text-grey-700"
      >
        ← 검색으로 돌아가기
      </Link>

      <h1 className="mt-4 text-[30px] leading-tight font-bold break-keep text-grey-900 sm:text-[36px]">
        기업 비교
      </h1>
      <p className="mt-1.5 text-[15px] break-keep text-grey-500">
        최대 {MAX_COMPARE}곳까지 실적과 재무비율을 나란히 놓고 봅니다.
      </p>

      <div className="mt-6 max-w-xl">
        <ComparePicker codes={codes} granularity={granularity} />
      </div>

      {codes.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {codes.map((code, index) => (
            <Suspense
              key={code}
              fallback={
                <span className="h-9 w-32 animate-pulse rounded-xl bg-grey-100" />
              }
            >
              <CompanyChip
                corpCode={code}
                color={compareColor(index)}
                removeHref={compareHref(
                  codes.filter((item) => item !== code),
                  granularity,
                )}
              />
            </Suspense>
          ))}
        </div>
      )}

      <div className="mt-6">
        <SegmentedTabs
          active={granularity}
          options={[
            { value: "annual", label: "연간 5개년", href: compareHref(codes, "annual") },
            { value: "quarter", label: "분기 8개", href: compareHref(codes, "quarter") },
          ]}
        />
      </div>

      {codes.length === 0 ? (
        <div className="mt-6">
          <EmptyState message="위에서 기업을 검색해 추가하면 비교표가 만들어져요." />
        </div>
      ) : (
        <Suspense key={`${codes.join(",")}-${granularity}`} fallback={<CompareSkeleton />}>
          <CompareBody codes={codes} granularity={granularity} />
        </Suspense>
      )}
    </div>
  );
}

async function CompanyChip({
  corpCode,
  color,
  removeHref,
}: {
  corpCode: string;
  color: string;
  removeHref: string;
}) {
  const profile = await getCompanyProfile(corpCode).catch(() => null);
  const name = profile?.corp_name ?? corpCode;

  return (
    <span className="inline-flex items-center gap-2 rounded-xl bg-white py-2 pr-2 pl-3 shadow-card ring-1 ring-grey-100">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="text-[14px] font-semibold text-grey-800">{name}</span>
      <Link
        href={removeHref}
        scroll={false}
        aria-label={`${name} 빼기`}
        className="flex h-6 w-6 items-center justify-center rounded-lg text-grey-400 hover:bg-grey-100 hover:text-grey-600"
      >
        ✕
      </Link>
    </span>
  );
}

function CompareSkeleton() {
  return (
    <Section title="매출액" description="불러오는 중이에요">
      <div className="card p-5">
        <div className="h-[260px] w-full animate-pulse rounded-lg bg-grey-100" />
      </div>
    </Section>
  );
}

type Entry = { corpCode: string; name: string; color: string; series: FinancialSeries };

async function CompareBody({
  codes,
  granularity,
}: {
  codes: string[];
  granularity: Granularity;
}) {
  const entries: Entry[] = (
    await Promise.all(
      codes.map(async (corpCode, index) => {
        const [profile, series] = await Promise.all([
          getCompanyProfile(corpCode).catch(() => null),
          getFinancialSeries(corpCode, granularity).catch(() => null),
        ]);
        if (!series || series.periods.length === 0) return null;
        return {
          corpCode,
          name: profile?.corp_name ?? corpCode,
          color: compareColor(index),
          series,
        };
      }),
    )
  ).filter((entry): entry is Entry => entry !== null);

  if (entries.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState message="고른 기업의 재무 데이터를 찾지 못했어요. 비상장 법인이거나 공시된 재무제표가 없을 수 있습니다." />
      </div>
    );
  }

  // 회사마다 결산 시점이 달라 기간 라벨을 합집합으로 모아 축을 맞춘다.
  const labels = [...new Set(entries.flatMap((e) => e.series.periods.map((p) => p.label)))]
    .sort()
    .slice(-(granularity === "quarter" ? 8 : 5));

  const lineSeries = entries.map((entry) => ({
    key: entry.corpCode,
    name: entry.name,
    color: entry.color,
  }));

  function chartData(pick: (entry: Entry, label: string) => number | null) {
    return labels.map((label) => {
      const row: Record<string, string | number | null> = { label };
      for (const entry of entries) row[entry.corpCode] = pick(entry, label);
      return row;
    });
  }

  const at = (entry: Entry, label: string) =>
    entry.series.periods.find((period) => period.label === label) ?? null;

  const revenueData = chartData((entry, label) => at(entry, label)?.revenue ?? null);
  const marginData = chartData((entry, label) => {
    const period = at(entry, label);
    return period ? computeRatios(period).operatingMargin : null;
  });

  const rows = [
    { label: "매출액", render: (e: Entry) => formatKrw(latestOf(e).revenue) },
    { label: "영업이익", render: (e: Entry) => formatKrw(latestOf(e).operatingIncome) },
    { label: "당기순이익", render: (e: Entry) => formatKrw(latestOf(e).netIncome) },
    { label: "자산총계", render: (e: Entry) => formatKrw(latestOf(e).assets) },
    {
      label: "영업이익률",
      render: (e: Entry) => formatPercent(computeRatios(latestOf(e)).operatingMargin),
    },
    {
      label: "순이익률",
      render: (e: Entry) => formatPercent(computeRatios(latestOf(e)).netMargin),
    },
    {
      label: "ROE",
      render: (e: Entry) => formatPercent(computeRatios(latestOf(e)).roe),
    },
    {
      label: "부채비율",
      render: (e: Entry) => formatPercent(computeRatios(latestOf(e)).debtRatio),
    },
    {
      label: "유동비율",
      render: (e: Entry) => formatPercent(computeRatios(latestOf(e)).currentRatio),
    },
  ];

  return (
    <>
      <Section
        title="매출액"
        description={`최근 ${labels.length}개 ${granularity === "quarter" ? "분기" : "연도"} · 단위 원`}
      >
        <div className="card p-5 pt-6">
          <MultiLineChart data={revenueData} series={lineSeries} unit="krw" />
        </div>
      </Section>

      <Section title="영업이익률" description="매출에서 영업이익이 차지하는 비중입니다.">
        <div className="card p-5 pt-6">
          <MultiLineChart data={marginData} series={lineSeries} unit="percent" />
        </div>
      </Section>

      <Section
        title="최신 기간 비교"
        description={entries
          .map((entry) => `${entry.name} ${latestOf(entry).label}`)
          .join(" · ")}
      >
        <div className="card thin-scroll overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 560 }}>
            <thead>
              <tr className="border-b border-grey-100">
                <th className="px-5 py-3.5 text-left text-[13px] font-semibold text-grey-500">
                  항목
                </th>
                {entries.map((entry) => (
                  <th
                    key={entry.corpCode}
                    className="px-5 py-3.5 text-right text-[13px] font-semibold whitespace-nowrap text-grey-700"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: entry.color }}
                      />
                      {entry.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-grey-100 last:border-b-0">
                  <td className="px-5 py-3.5 text-[14px] font-medium whitespace-nowrap text-grey-800">
                    {row.label}
                  </td>
                  {entries.map((entry) => (
                    <td
                      key={entry.corpCode}
                      className="tnum px-5 py-3.5 text-right text-[14px] whitespace-nowrap text-grey-700"
                    >
                      {row.render(entry)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2.5 px-1 text-[12px] leading-relaxed break-keep text-grey-500">
          회사마다 결산월이 달라 최신 기간이 서로 다를 수 있습니다. 각 회사의 가장 최근
          공시 기간을 씁니다.
        </p>
      </Section>
    </>
  );
}

function latestOf(entry: Entry) {
  return entry.series.periods[entry.series.periods.length - 1];
}
