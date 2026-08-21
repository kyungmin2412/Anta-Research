import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import { hasApiKey } from "@/lib/dart";

const POPULAR = [
  { corpCode: "00126380", name: "삼성전자" },
  { corpCode: "00164779", name: "SK하이닉스" },
  { corpCode: "00164742", name: "현대자동차" },
  { corpCode: "00113410", name: "NAVER" },
  { corpCode: "00258801", name: "카카오" },
  { corpCode: "00877059", name: "LG에너지솔루션" },
  { corpCode: "00106641", name: "셀트리온" },
  { corpCode: "00159193", name: "KB금융" },
];

const FEATURES = [
  {
    title: "실적 흐름",
    body: "최근 5개 사업연도의 매출·영업이익·순이익을 한 화면에서 비교합니다.",
    emoji: "📈",
  },
  {
    title: "수익성과 안정성",
    body: "영업이익률, ROE, 부채비율, 유동비율을 자동으로 계산해 보여줍니다.",
    emoji: "🧮",
  },
  {
    title: "최신 공시",
    body: "최근 1년간 제출된 공시를 원문 링크와 함께 정리합니다.",
    emoji: "🗂️",
  },
];

export default function HomePage() {
  return (
    <div className="animate-fade-up">
      <section className="pt-16 pb-10 sm:pt-24">
        <p className="text-[15px] font-semibold text-blue-500">DART 전자공시 기반</p>
        <h1 className="mt-3 text-[30px] leading-[1.3] font-bold tracking-tight break-keep text-grey-900 sm:text-[44px] sm:leading-[1.25]">
          기업의 숫자를
          <br />
          가장 쉽게 확인하는 방법
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed break-keep text-grey-600 sm:text-[17px]">
          10만 개가 넘는 국내 법인의 재무제표와 공시를 검색 한 번으로 살펴보세요.
        </p>

        <div className="mt-8">
          <SearchBar autoFocus />
        </div>

        {!hasApiKey() && (
          <div className="mt-5 rounded-2xl bg-yellow-100 px-5 py-4 text-[14px] leading-relaxed text-grey-800">
            <p className="font-semibold">DART API 키가 아직 설정되지 않았어요.</p>
            <p className="mt-1 text-grey-700">
              프로젝트 루트에 <code className="rounded bg-white/70 px-1.5 py-0.5">.env.local</code>{" "}
              파일을 만들고 <code className="rounded bg-white/70 px-1.5 py-0.5">DART_API_KEY=발급받은키</code>{" "}
              를 넣은 뒤 서버를 다시 시작해 주세요. 키는{" "}
              <a
                className="font-semibold text-blue-600 underline"
                href="https://opendart.fss.or.kr/uss/umt/EgovMberInsertView.do"
                target="_blank"
                rel="noreferrer"
              >
                오픈DART
              </a>
              에서 무료로 발급받을 수 있습니다.
            </p>
          </div>
        )}

        <div className="mt-7">
          <p className="text-[13px] font-semibold text-grey-500">많이 찾는 기업</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {POPULAR.map((item) => (
              <Link
                key={item.corpCode}
                href={`/company/${item.corpCode}`}
                className="rounded-full bg-white px-4 py-2 text-[14px] font-medium text-grey-700 shadow-card ring-1 ring-grey-100 transition-colors hover:bg-grey-100"
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="card p-6">
            <div className="text-[22px]">{feature.emoji}</div>
            <h2 className="mt-3 text-[16px] font-bold text-grey-900">{feature.title}</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-grey-600">
              {feature.body}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
