import { NextResponse } from "next/server";
import { DartError, hasApiKey } from "@/lib/dart";
import { getReportDocument, findSection } from "@/lib/report-doc";
import { getPeriodicReports } from "@/lib/reports";

export const runtime = "nodejs";

/**
 * 임시 진단용 라우트. 개발 샌드박스는 DART 서버로 나가는 아웃바운드가 막혀 있어
 * 원문을 직접 받아볼 수 없어서, 실제 DART 접근이 되는 배포 환경에서 대신 받아
 * 확인하려고 만들었다. 확인이 끝나면 지운다.
 *
 * ?corpCode=00126380  → 최근 정기보고서 목록(접수번호 포함)
 * ?rceptNo=2024...    → 그 접수번호 문서에서 종속기업 노트로 보이는 표를 그대로 덤프
 */
export async function GET(request: Request) {
  if (!hasApiKey()) {
    return NextResponse.json({ error: "DART_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  const url = new URL(request.url);
  const corpCode = url.searchParams.get("corpCode");
  const rceptNo = url.searchParams.get("rceptNo");

  try {
    if (rceptNo) {
      const sections = await getReportDocument(rceptNo, ["재무에 관한 사항"]);
      const tables = findSection(sections, "재무에 관한 사항")?.tables ?? [];
      const matches = tables.filter((table) => {
        const header = table.grid
          .slice(0, Math.max(table.headerRows, 1))
          .flat()
          .join(" ")
          .replace(/\s/g, "");
        return (
          header.includes("종속기업명") && /매출액/.test(header) && /순손익|순이익/.test(header)
        );
      });
      return NextResponse.json({
        rceptNo,
        matchCount: matches.length,
        tables: matches.map((table) => ({
          caption: table.caption,
          context: table.context,
          unitNote: table.unitNote,
          headerRows: table.headerRows,
          grid: table.grid,
        })),
      });
    }

    if (corpCode) {
      const reports = await getPeriodicReports(corpCode, { years: 5, accMonth: 12 });
      return NextResponse.json({
        corpCode,
        reports: reports.map((r) => ({
          rceptNo: r.rceptNo,
          kind: r.kind,
          reportName: r.reportName,
          fiscalYear: r.fiscalYear,
          quarterIndex: r.quarterIndex,
          receiptDate: r.receiptDate,
        })),
      });
    }

    return NextResponse.json({ error: "corpCode 또는 rceptNo 파라미터가 필요합니다." }, { status: 400 });
  } catch (error) {
    const message = error instanceof DartError ? error.message : "원문을 받지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
