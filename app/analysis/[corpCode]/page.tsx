import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Section } from "@/components/ui";
import { CORP_CLASS_LABEL, getCompanyProfile } from "@/lib/company";
import { DartError } from "@/lib/dart";
import {
  formatReceiptDate,
  getPeriodicReports,
  periodLabel,
  REPORT_KIND_LABEL,
  type PeriodicReport,
} from "@/lib/reports";

export const revalidate = 3600;

const REPORT_YEARS = 5;

type PageProps = { params: Promise<{ corpCode: string }> };

export async function generateMetadata({ params }: PageProps) {
  const { corpCode } = await params;
  try {
    const profile = await getCompanyProfile(corpCode);
    return { title: `${profile.corp_name} 보고서 — Anta Research` };
  } catch {
    return { title: "개별 기업 분석 — Anta Research" };
  }
}

export default async function AnalysisPage({ params }: PageProps) {
  const { corpCode } = await params;
  if (!/^\d{8}$/.test(corpCode)) notFound();

  return (
    <div className="animate-fade-up pt-8">
      <Link
        href="/analysis"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-grey-500 hover:text-grey-700"
      >
        ← 다른 기업 찾기
      </Link>

      <Suspense fallback={<ReportsSkeleton />}>
        <CompanyReports corpCode={corpCode} />
      </Suspense>
    </div>
  );
}

async function CompanyReports({ corpCode }: { corpCode: string }) {
  let profile;
  try {
    profile = await getCompanyProfile(corpCode);
  } catch (error) {
    if (error instanceof DartError && error.status === "013") notFound();
    throw error;
  }

  const accMonth = Number(profile.acc_mt) || 12;
  const reports = await getPeriodicReports(corpCode, {
    years: REPORT_YEARS,
    accMonth,
  });

  // 회계연도별로 묶어 최신 연도부터 놓는다.
  const byYear = new Map<number, PeriodicReport[]>();
  for (const report of reports) {
    const bucket = byYear.get(report.fiscalYear) ?? [];
    bucket.push(report);
    byYear.set(report.fiscalYear, bucket);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  return (
    <>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-blue-100 px-2 py-1 text-[12px] font-semibold text-blue-700">
              {CORP_CLASS_LABEL[profile.corp_cls] ?? "기타"}
            </span>
            {profile.stock_code && (
              <span className="tnum rounded-md bg-grey-100 px-2 py-1 text-[12px] font-semibold text-grey-600">
                {profile.stock_code}
              </span>
            )}
            {accMonth !== 12 && (
              <span className="rounded-md bg-grey-100 px-2 py-1 text-[12px] font-semibold text-grey-600">
                {accMonth}월 결산
              </span>
            )}
          </div>
          <h1 className="mt-3 text-[30px] leading-tight font-bold break-keep text-grey-900 sm:text-[36px]">
            {profile.corp_name}
          </h1>
          <p className="mt-1 text-[14px] text-grey-500">정기보고서 {reports.length}건</p>
        </div>
        <Link
          href={`/company/${corpCode}`}
          className="rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-grey-700 shadow-card ring-1 ring-grey-100 hover:bg-grey-100"
        >
          재무 지표 보기
        </Link>
      </header>

      <Section
        title={`정기보고서 ${REPORT_YEARS}년치`}
        description="같은 기간에 정정신고가 여러 건이면 마지막 접수분만 남겼습니다."
      >
        {reports.length === 0 ? (
          <EmptyState message="최근 5년 안에 접수된 정기보고서가 없습니다. 비상장 법인이거나 공시 의무가 없는 회사일 수 있어요." />
        ) : (
          <div className="space-y-6">
            {years.map((year) => (
              <div key={year}>
                <p className="tnum px-1 text-[14px] font-bold text-grey-900">
                  {year} 회계연도
                </p>
                <ul className="mt-2 space-y-2">
                  {byYear
                    .get(year)!
                    .sort((a, b) => b.quarterIndex - a.quarterIndex)
                    .map((report) => (
                      <li key={report.rceptNo}>
                        <a
                          href={report.viewerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="card flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 transition-colors hover:bg-grey-100"
                        >
                          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[12px] font-semibold text-blue-700">
                            {REPORT_KIND_LABEL[report.kind]}
                          </span>
                          <span className="text-[15px] font-semibold text-grey-900">
                            {periodLabel(report)}
                          </span>
                          {report.amended && (
                            <span className="rounded-md bg-yellow-100 px-2 py-0.5 text-[12px] font-semibold text-grey-700">
                              정정
                            </span>
                          )}
                          <span className="tnum ml-auto text-[13px] text-grey-500">
                            {formatReceiptDate(report.receiptDate)} 접수
                          </span>
                          <span className="text-[13px] font-medium text-blue-600">
                            원문 →
                          </span>
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="본문 지표"
        description="가동률, 제품 가격변동, 해외 매출 비중은 보고서 본문 표에서 뽑습니다."
      >
        <div className="card px-5 py-5 text-[14px] leading-relaxed text-grey-600">
          <p>
            이 세 지표는 DART 정형 API에 없고 보고서 본문 &ldquo;II. 사업의 내용&rdquo;
            표에만 실립니다. 표를 읽으려면 공시서류 원본을 받아 파싱해야 하는데, 아직
            원본 형식을 확인하지 못해 넣지 않았습니다.
          </p>
          <p className="mt-2">
            위 목록의 <span className="font-semibold text-grey-800">원문 →</span> 을 눌러
            DART 뷰어에서 바로 확인할 수 있습니다.
          </p>
        </div>
      </Section>
    </>
  );
}

function ReportsSkeleton() {
  return (
    <div className="mt-4">
      <div className="h-6 w-24 animate-pulse rounded-md bg-grey-100" />
      <div className="mt-3 h-10 w-56 animate-pulse rounded-lg bg-grey-100" />
      <div className="mt-8 space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-2xl bg-grey-100" />
        ))}
      </div>
    </div>
  );
}
