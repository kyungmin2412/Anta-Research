import { dartJsonOptional } from "./dart";

/** 정기보고서 종류. DART 는 사업·반기·분기 세 가지로만 낸다. */
export type ReportKind = "annual" | "half" | "quarter";

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  annual: "사업보고서",
  half: "반기보고서",
  quarter: "분기보고서",
};

export type PeriodicReport = {
  /** 접수번호. 원문(document.xml)을 받는 열쇠다. */
  rceptNo: string;
  reportName: string;
  kind: ReportKind;
  /** 보고 기준 시점 (예: 2025.03) */
  periodYear: number;
  periodMonth: number;
  /** 회계연도와, 그 해 몇 번째 분기까지를 담은 보고서인지 */
  fiscalYear: number;
  quarterIndex: 1 | 2 | 3 | 4;
  /** 접수일자 YYYYMMDD */
  receiptDate: string;
  /** 정정신고가 있었던 기간인지 */
  amended: boolean;
  viewerUrl: string;
};

type ListResponse = {
  status: string;
  message: string;
  page_no?: number;
  total_page?: number;
  list?: Array<{
    corp_code: string;
    corp_name: string;
    report_nm: string;
    rcept_no: string;
    rcept_dt: string;
    flr_nm: string;
    rm: string;
  }>;
};

/** "[기재정정]분기보고서 (2025.03)" 에서 종류와 기준월을 꺼낸다. */
function parseReportName(
  name: string,
): { kind: ReportKind; year: number; month: number; amended: boolean } | null {
  const amended = /\[[^\]]*정정[^\]]*\]|\[첨부(추가|정정)\]/.test(name);

  const kind: ReportKind | null = name.includes("사업보고서")
    ? "annual"
    : name.includes("반기보고서")
      ? "half"
      : name.includes("분기보고서")
        ? "quarter"
        : null;
  if (!kind) return null;

  const period = name.match(/\((\d{4})[.\-/\s]?(\d{2})\)/);
  if (!period) return null;

  return { kind, year: Number(period[1]), month: Number(period[2]), amended };
}

/**
 * 결산월을 기준으로 회계연도와 분기 순번을 매긴다.
 * 12월 결산이면 3월이 1분기지만 3월 결산이면 6월이 1분기라, 달만 보고 정하면 틀린다.
 */
function fiscalPosition(
  year: number,
  month: number,
  accMonth: number,
): { fiscalYear: number; quarterIndex: 1 | 2 | 3 | 4 } {
  const monthsIn = ((month - accMonth - 1 + 12) % 12) + 1;
  const quarterIndex = Math.ceil(monthsIn / 3) as 1 | 2 | 3 | 4;
  // 회계연도는 결산이 끝나는 해로 적는다. 3월 결산 회사의 2025.06 보고서는 2026 회계연도다.
  const fiscalYear = month > accMonth ? year + 1 : year;
  return { fiscalYear, quarterIndex };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * 최근 몇 년치 정기보고서 목록. 같은 기간에 정정신고가 여러 건이면 마지막 접수분만 남긴다.
 *
 * 결산월(accMonth)은 company.json 의 acc_mt 다. 넘기지 않으면 12월 결산으로 본다.
 */
export async function getPeriodicReports(
  corpCode: string,
  { years = 5, accMonth = 12 }: { years?: number; accMonth?: number } = {},
): Promise<PeriodicReport[]> {
  const today = new Date();
  const end = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
  // 5년치 보고서를 받으려면 5년 전 회계연도의 사업보고서(이듬해 3월 접수)까지 들어와야 한다.
  const begin = `${today.getFullYear() - years - 1}0101`;

  const collected: ListResponse["list"] = [];
  let page = 1;
  // 정기보고서만이라 보통 한 장이면 끝난다. 그래도 안전하게 몇 장은 넘긴다.
  for (; page <= 5; page++) {
    const data = await dartJsonOptional<ListResponse>(
      "list.json",
      {
        corp_code: corpCode,
        bgn_de: begin,
        end_de: end,
        pblntf_ty: "A", // 정기공시
        page_no: page,
        page_count: 100,
      },
      60 * 60 * 6,
    );
    if (!data?.list?.length) break;
    collected.push(...data.list);
    if (!data.total_page || page >= data.total_page) break;
  }

  // 기간별로 마지막 접수분만 남긴다. 접수번호는 접수 순으로 커지므로 문자열 비교로 충분하다.
  const latest = new Map<string, PeriodicReport>();
  for (const item of collected) {
    const parsed = parseReportName(item.report_nm);
    if (!parsed) continue;

    const { fiscalYear, quarterIndex } = fiscalPosition(
      parsed.year,
      parsed.month,
      accMonth,
    );
    const key = `${parsed.year}-${pad(parsed.month)}-${parsed.kind}`;
    const previous = latest.get(key);
    const report: PeriodicReport = {
      rceptNo: item.rcept_no,
      reportName: item.report_nm,
      kind: parsed.kind,
      periodYear: parsed.year,
      periodMonth: parsed.month,
      fiscalYear,
      quarterIndex,
      receiptDate: item.rcept_dt,
      amended: parsed.amended,
      viewerUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`,
    };
    // 같은 기간이 두 번 나왔다면 정정이 있었다는 뜻이다. 보고서 이름에 표시가 없어도 그렇다.
    const amended = parsed.amended || Boolean(previous) || Boolean(previous?.amended);
    const winner = !previous || item.rcept_no > previous.rceptNo ? report : previous;
    latest.set(key, { ...winner, amended });
  }

  const cutoff = today.getFullYear() - years;
  return [...latest.values()]
    .filter((report) => report.fiscalYear > cutoff)
    .sort((a, b) => b.rceptNo.localeCompare(a.rceptNo));
}

/** 보고서가 담은 기간을 사람이 읽는 말로. */
export function periodLabel(report: PeriodicReport): string {
  if (report.kind === "annual") return `${report.fiscalYear} 연간`;
  if (report.kind === "half") return `${report.fiscalYear} 상반기`;
  return `${report.fiscalYear} ${report.quarterIndex}분기`;
}

export function formatReceiptDate(value: string): string {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}
