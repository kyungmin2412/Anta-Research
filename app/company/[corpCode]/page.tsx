import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SegmentedTabs } from "@/components/ui";
import {
  CORP_CLASS_LABEL,
  getCompanyProfile,
  type CompanyProfile,
} from "@/lib/company";
import { DartError } from "@/lib/dart";
import type { Granularity } from "@/lib/finance";
import { metricsParam, parseMetrics, type MetricKey } from "@/lib/metrics";
import {
  ConsolidationSection,
  FinancialsSection,
  FinancialsSkeleton,
  ListSkeleton,
} from "./sections";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ corpCode: string }>;
  searchParams: Promise<{ p?: string; m?: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { corpCode } = await params;
  try {
    const profile = await getCompanyProfile(corpCode);
    return {
      title: `${profile.corp_name} 기업분석 — Anta Research`,
      description: `${profile.corp_name}의 매출, 영업이익, 수익성·안정성 지표를 DART 데이터로 확인하세요.`,
    };
  } catch {
    return { title: "기업분석 — Anta Research" };
  }
}

export default async function CompanyPage({ params, searchParams }: PageProps) {
  const { corpCode } = await params;
  if (!/^\d{8}$/.test(corpCode)) notFound();

  // 회사 개요를 기다리지 않고 조회만 걸어 둔다. 여기서 await하면 재무·공시·주주
  // 조회가 개요가 올 때까지 시작조차 못 해 DART를 한 번 더 왕복하게 된다.
  const profilePromise = getCompanyProfile(corpCode);
  // 렌더 중 예외가 떠도 처리되지 않은 거부로 남지 않게 한다.
  profilePromise.catch(() => {});

  const query = await searchParams;
  const granularity: Granularity = query.p === "q" ? "quarter" : "annual";
  const metrics = parseMetrics(query.m);

  // 기간 탭과 지표 선택이 서로를 지우지 않도록 링크를 함께 만든다.
  const hrefFor = (next: { granularity?: Granularity; metrics?: MetricKey[] }) => {
    const params = new URLSearchParams();
    if ((next.granularity ?? granularity) === "quarter") params.set("p", "q");
    params.set("m", metricsParam(next.metrics ?? metrics));
    return `/company/${corpCode}?${params}`;
  };

  return (
    <div className="animate-fade-up pt-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-grey-500 hover:text-grey-700"
      >
        ← 검색으로 돌아가기
      </Link>

      <Suspense fallback={<HeaderSkeleton />}>
        <CompanyHeader corpCode={corpCode} profilePromise={profilePromise} />
      </Suspense>

      <div className="mt-6">
        <SegmentedTabs
          active={granularity}
          options={[
            {
              value: "annual",
              label: "연간 5개년",
              href: hrefFor({ granularity: "annual" }),
            },
            {
              value: "quarter",
              label: "분기 8개",
              href: hrefFor({ granularity: "quarter" }),
            },
          ]}
        />
      </div>

      <Suspense key={granularity} fallback={<FinancialsSkeleton />}>
        <FinancialsSection
          corpCode={corpCode}
          granularity={granularity}
          metrics={metrics}
          metricHref={(next) => hrefFor({ metrics: next })}
        />
      </Suspense>

      <Suspense fallback={<ListSkeleton title="연결 vs 별도" rows={4} />}>
        <ConsolidationSection corpCode={corpCode} />
      </Suspense>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <header className="mt-4">
      <div className="h-6 w-24 animate-pulse rounded-md bg-grey-100" />
      <div className="mt-3 h-10 w-56 animate-pulse rounded-lg bg-grey-100" />
      <div className="mt-2 h-4 w-40 animate-pulse rounded-md bg-grey-100" />
    </header>
  );
}

async function resolveProfile(promise: Promise<CompanyProfile>) {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof DartError && error.status === "013") notFound();
    throw error;
  }
}

async function CompanyHeader({
  corpCode,
  profilePromise,
}: {
  corpCode: string;
  profilePromise: Promise<CompanyProfile>;
}) {
  const profile = await resolveProfile(profilePromise);
  const marketLabel = CORP_CLASS_LABEL[profile.corp_cls] ?? "기타";
  const homepage = profile.hm_url
    ? profile.hm_url.startsWith("http")
      ? profile.hm_url
      : `https://${profile.hm_url}`
    : null;

  return (
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
        </div>
        <h1 className="mt-3 text-[30px] leading-tight font-bold break-keep text-grey-900 sm:text-[36px]">
          {profile.corp_name}
        </h1>
        <p className="mt-1 text-[14px] text-grey-500">
          {profile.corp_name_eng || profile.stock_name || "—"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/compare?codes=${corpCode}`}
          className="rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-grey-700 shadow-card ring-1 ring-grey-100 hover:bg-grey-100"
        >
          다른 기업과 비교
        </Link>
        {homepage && (
          <a
            href={homepage}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-grey-700 shadow-card ring-1 ring-grey-100 hover:bg-grey-100"
          >
            홈페이지
          </a>
        )}
      </div>
    </header>
  );
}
