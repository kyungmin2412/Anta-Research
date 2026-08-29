import Link from "next/link";
import ReportSearchBar from "@/components/ReportSearchBar";

export const metadata = {
  title: "개별 기업 분석 — Anta Research",
  description: "기업 하나를 골라 최근 5년치 정기보고서를 모아 봅니다.",
};

const POPULAR = [
  { corpCode: "00126380", name: "삼성전자" },
  { corpCode: "00164779", name: "SK하이닉스" },
  { corpCode: "00164742", name: "현대자동차" },
  { corpCode: "00356361", name: "POSCO홀딩스" },
  { corpCode: "00113410", name: "NAVER" },
];

export default function AnalysisHome() {
  return (
    <div className="animate-fade-up">
      <section className="pt-16 pb-10">
        <p className="text-[15px] font-semibold text-blue-500">개별 기업 분석</p>
        <h1 className="mt-3 text-[30px] leading-[1.3] font-bold tracking-tight break-keep text-grey-900 sm:text-[40px]">
          한 기업의 보고서를
          <br />
          5년치 모아서 봅니다
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed break-keep text-grey-600">
          기업을 고르면 최근 5년의 사업·반기·분기보고서를 회계연도별로 정리해 보여줍니다.
          정정신고가 여러 번 있었다면 마지막 접수분만 남깁니다.
        </p>

        <div className="mt-8">
          <ReportSearchBar autoFocus />
        </div>

        <div className="mt-7">
          <p className="text-[13px] font-semibold text-grey-500">바로 보기</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {POPULAR.map((item) => (
              <Link
                key={item.corpCode}
                href={`/analysis/${item.corpCode}`}
                className="rounded-full bg-white px-4 py-2 text-[14px] font-medium text-grey-700 shadow-card ring-1 ring-grey-100 transition-colors hover:bg-grey-100"
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
