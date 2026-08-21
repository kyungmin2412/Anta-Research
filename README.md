# Anta Research

금융감독원 전자공시(DART) 오픈API로 국내 법인의 재무·수익성·안정성을 살펴보는 기업분석 웹앱입니다. 화면은 토스 스타일을 참고했습니다.

## 무엇을 볼 수 있나요

- **기업 검색** — 이름·영문명·종목코드로 10만 개가 넘는 DART 등록 법인을 찾습니다.
- **핵심 지표** — 최근 사업연도의 매출액, 영업이익, 당기순이익, 자산총계와 전년 대비 증감.
- **실적 흐름** — 최근 5개 사업연도의 매출·영업이익·순이익 추이 차트.
- **수익성** — 영업이익률, 순이익률, ROE, ROA.
- **재무 안정성** — 부채비율, 유동비율, 자기자본비율과 자본/부채 구성.
- **현금흐름** — 영업·투자·재무활동 현금흐름.
- **기업 개요 / 최대주주 / 직원 현황 / 최근 1년 공시** (공시는 DART 원문으로 연결).

## 시작하기

1. [오픈DART](https://opendart.fss.or.kr/uss/umt/EgovMberInsertView.do)에서 인증키를 무료로 발급받습니다.
2. 프로젝트 루트에 `.env.local`을 만들고 키를 넣습니다.

   ```bash
   cp .env.example .env.local
   # DART_API_KEY=발급받은키
   ```

3. 의존성을 설치하고 개발 서버를 실행합니다.

   ```bash
   npm install
   npm run dev
   ```

4. http://localhost:3000 을 엽니다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `app/page.tsx` | 검색 중심의 홈 화면 |
| `app/company/[corpCode]/page.tsx` | 기업분석 리포트 (서버 컴포넌트) |
| `app/api/search/route.ts` | 기업명·종목코드 검색 엔드포인트 |
| `lib/dart.ts` | DART 오픈API 호출과 오류 코드 처리 |
| `lib/corp-code.ts` | 고유번호 목록 다운로드·캐싱·검색 |
| `lib/finance.ts` | 재무제표 계정 매핑과 비율 계산 |
| `components/FinancialCharts.tsx` | Recharts 기반 실적·수익성 차트 |

기업 고유번호 목록(`corpCode.xml`, 약 10만 건)은 첫 검색 때 내려받아 `.cache/`에 24시간 보관합니다. 나머지 응답은 Next.js의 `revalidate`로 캐싱해 DART의 일일 호출 한도(20,000건)를 아낍니다.

## 주의

DART 오픈API는 정기보고서(사업보고서) 기준 데이터를 제공합니다. 시가총액·주가처럼 실시간 시장 데이터는 포함되지 않으며, 비상장 법인은 재무제표가 공시되지 않을 수 있습니다. 투자 판단의 책임은 이용자 본인에게 있습니다.
