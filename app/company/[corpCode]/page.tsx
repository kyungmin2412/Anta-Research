import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoRow, Section, SegmentedTabs } from "@/components/ui";
import {
  CORP_CLASS_LABEL,
  getCompanyProfile,
  type CompanyProfile,
} from "@/lib/company";
import { DartError } from "@/lib/dart";
import type { Granularity } from "@/lib/finance";
import { formatDartDate } from "@/lib/format";
import {
  AffiliatesSection,
  DisclosureSection,
  FinancialsSection,
  FinancialsSkeleton,
  ListSkeleton,
  OwnershipSection,
} from "./sections";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ corpCode: string }>;
  searchParams: Promise<{ p?: string }>;
};

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

export default async function CompanyPage({ params, searchParams }: PageProps) {
  const { corpCode } = await params;
  if (!/^\d{8}$/.test(corpCode)) notFound();

  // 회사 개요를 기다리지 않고 조회만 걸어 둔다. 여기서 await하면 재무·공시·주주
  // 조회가 개요가 올 때까지 시작조차 못 해 DART를 한 번 더 왕복하게 된다.
  const profilePromise = getCompanyProfile(corpCode);
  // 렌더 중 예외가 떠도 처리되지 않은 거부로 남지 않게 한다.
  profilePromise.catch(() => {});

  const granularity: Granularity =
    (await searchParams).p === "q" ? "quarter" : "annual";

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
            { value: "annual", label: "연간 5개년", href: `/company/${corpCode}` },
            { value: "quarter", label: "분기 8개", href: `/company/${corpCode}?p=q` },
          ]}
        />
      </div>

      <Suspense key={granularity} fallback={<FinancialsSkeleton />}>
        <FinancialsSection corpCode={corpCode} granularity={granularity} />
      </Suspense>

      <Suspense fallback={<ListSkeleton title="출자 법인" rows={4} />}>
        <AffiliatesSection corpCode={corpCode} />
      </Suspense>

      <Suspense fallback={<ListSkeleton title="기업 개요" rows={4} />}>
        <ProfileSection profilePromise={profilePromise} />
      </Suspense>

      <Suspense fallback={<ListSkeleton title="최대주주 현황" />}>
        <OwnershipSection corpCode={corpCode} />
      </Suspense>

      <Suspense fallback={<ListSkeleton title="최근 공시" rows={5} />}>
        <DisclosureSection corpCode={corpCode} />
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

async function ProfileSection({
  profilePromise,
}: {
  profilePromise: Promise<CompanyProfile>;
}) {
  const profile = await resolveProfile(profilePromise);
  return (
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
  );
}
