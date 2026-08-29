import type { ReportSection, ReportTable } from "./report-doc";
import { findSection } from "./report-doc";

/**
 * 정기보고서 본문 "II. 사업의 내용" 표에서 정형 API 에 없는 지표를 뽑는다.
 *
 * 표는 회사마다 다르지만 한 회사 안에서는 해마다 거의 같다. 그래서 소제목 대신
 * 머리글 문구로 표를 찾는다. 소제목은 앞 문단과 섞여 들쭉날쭉하지만 머리글은
 * 기업공시서식 작성기준을 따라 어느 회사나 비슷하게 적기 때문이다.
 */

/**
 * 칸 전체가 숫자일 때만 숫자로 본다. "전년 대비 4% 상승" 같은 설명에서 4를 뽑아
 * 단가처럼 그리면 읽는 사람을 속이게 된다.
 */
export function isNumericCell(value: string): boolean {
  return /^[△▲(-]?[\d,]+(\.\d+)?\)?%?$/.test(value.replace(/\s/g, ""));
}

/** "1,699,923" → 1699923, "△230,152" → -230152, "74.9%" → 74.9, "-" → null */
export function parseNumber(value: string): number | null {
  const text = value.replace(/\s/g, "");
  if (!text || /^[-–—ㆍ·]+$/.test(text)) return null;
  const negative = /^[△▲(]/.test(text) || /^-/.test(text);
  const digits = text.replace(/[^\d.]/g, "");
  if (!digits || !/\d/.test(digits)) return null;
  const number = Number(digits);
  if (!Number.isFinite(number)) return null;
  return negative ? -number : number;
}

/** "(단위 : 억원, %)" 에서 금액 배수를 읽는다. 단위를 놓치면 자릿수가 통째로 틀린다. */
export function unitScale(unitNote: string): number {
  if (/조원/.test(unitNote)) return 1_000_000_000_000;
  if (/억원/.test(unitNote)) return 100_000_000;
  if (/백만원/.test(unitNote)) return 1_000_000;
  if (/천원/.test(unitNote)) return 1_000;
  if (/원/.test(unitNote)) return 1;
  return 1;
}

/** 머리글에 적힌 기간 칸을 찾는다. "제55기" 또는 "2023년" 둘 다 온다. */
type PeriodColumn = { index: number; label: string; year: number | null };

/**
 * 칸 전체가 기간 이름일 때만 인정한다. 주석 문장 안의 "2023년부터" 같은 말을
 * 기간 칸으로 세면 열이 통째로 밀린다.
 */
function isPeriodLabel(cell: string): boolean {
  const text = cell.replace(/\s/g, "");
  return /^제\d+기(말)?(\(.*\))?$/.test(text) || /^\d{4}년(도)?(말)?$/.test(text);
}

function periodColumns(table: ReportTable, fiscalYear: number): PeriodColumn[] {
  const header = table.grid.slice(0, Math.max(table.headerRows, 1));
  const width = table.grid[0]?.length ?? 0;
  const found: PeriodColumn[] = [];

  for (let column = 0; column < width; column++) {
    const label = header.map((row) => row[column] ?? "").find(isPeriodLabel);
    if (!label) continue;
    const year = label.match(/(\d{4})\s*년/);
    found.push({
      index: column,
      label: label.trim(),
      year: year ? Number(year[1]) : null,
    });
  }

  // "제55기" 꼴은 기수가 가장 큰 쪽이 이 보고서의 사업연도다. 거기서 거꾸로 센다.
  const numbers = found.map((item) => Number(item.label.match(/제\s*(\d+)\s*기/)?.[1] ?? NaN));
  const latest = Math.max(...numbers.filter(Number.isFinite));
  if (Number.isFinite(latest)) {
    found.forEach((item, index) => {
      if (item.year === null && Number.isFinite(numbers[index])) {
        item.year = fiscalYear - (latest - numbers[index]);
      }
    });
  }
  return found;
}

function headerText(table: ReportTable): string {
  return table.grid.slice(0, Math.max(table.headerRows, 1)).flat().join(" ");
}

function firstColumn(table: ReportTable): string[] {
  return table.grid.slice(table.headerRows).map((row) => `${row[0] ?? ""} ${row[1] ?? ""}`);
}

export type UtilizationRow = {
  segment: string;
  item: string;
  year: number | null;
  label: string;
  /** 가동률 (%) */
  rate: number;
};

export type RegionalSales = {
  year: number | null;
  label: string;
  domestic: number;
  overseas: number;
  total: number;
  /** 해외 매출 비중 (%) */
  overseasShare: number;
};

export type PriceRow = {
  item: string;
  values: Array<{ label: string; year: number | null; text: string; value: number | null }>;
};

export type BacklogRow = {
  item: string;
  values: Array<{ label: string; text: string }>;
};

export type ReportMetrics = {
  utilization: UtilizationRow[];
  regionalSales: RegionalSales[];
  priceChanges: PriceRow[];
  backlog: BacklogRow[];
  subsidiaries: SubsidiaryFinancialRow[];
  /** 금액 표의 단위 문구. 자릿수를 의심할 때 보라고 남긴다. */
  salesUnitNote: string;
};

/**
 * 가동률 표: 머리글에 "가동률"이 있다. 삼성전자처럼 부문별로 표를 나눠 싣기도 하고,
 * 기수별로 가동률 칸을 여러 개 두기도 해서 칸을 모두 모은다.
 */
function readUtilization(tables: ReportTable[], fiscalYear: number): UtilizationRow[] {
  const rows: UtilizationRow[] = [];

  for (const table of tables) {
    const header = table.grid.slice(0, Math.max(table.headerRows, 1));
    const width = table.grid[0]?.length ?? 0;
    const periods = periodColumns(table, fiscalYear);

    const rateColumns: Array<{ index: number; year: number | null; label: string }> = [];
    for (let column = 0; column < width; column++) {
      const isRate = header.some((row) =>
        (row[column] ?? "").replace(/\s/g, "").includes("가동률"),
      );
      if (!isRate) continue;
      // 기수 칸이 여러 줄 머리글로 위에 걸려 있으면 그 해의 가동률이다.
      const period = periods.find((item) => item.index === column);
      rateColumns.push({
        index: column,
        year: period?.year ?? (periods.length === 0 ? fiscalYear : null),
        label: period?.label ?? "",
      });
    }
    if (rateColumns.length === 0) continue;

    for (const row of table.grid.slice(table.headerRows)) {
      const segment = (row[0] ?? "").trim();
      const item = (row[1] ?? "").trim();
      if (!segment && !item) continue;
      for (const column of rateColumns) {
        const rate = parseNumber(row[column.index] ?? "");
        if (rate === null) continue;
        // 비율이므로 0~200 을 벗어나면 잘못 읽은 칸이다.
        if (rate < 0 || rate > 200) continue;
        rows.push({
          segment,
          item: item || segment,
          year: column.year,
          label: column.label,
          rate,
        });
      }
    }
  }
  return rows;
}

/**
 * 지역별 매출 표: 첫 칸에 "내수"와 "수출"이 함께 나온다.
 * 비중만 쓰면 단위를 몰라도 되지만 금액도 보여주므로 단위를 함께 읽는다.
 */
function readRegionalSales(
  tables: ReportTable[],
  fiscalYear: number,
): { rows: RegionalSales[]; unitNote: string } {
  for (const table of tables) {
    const labels = firstColumn(table).map((text) => text.replace(/\s/g, ""));
    const hasDomestic = labels.some((text) => /내수|국내/.test(text));
    const hasExport = labels.some((text) => /수출|해외/.test(text));
    if (!hasDomestic || !hasExport) continue;

    const periods = periodColumns(table, fiscalYear);
    if (periods.length === 0) continue;

    const scale = unitScale(table.unitNote);
    const body = table.grid.slice(table.headerRows);
    const rows: RegionalSales[] = [];

    for (const period of periods) {
      let domestic = 0;
      let overseas = 0;
      let seen = false;
      for (const row of body) {
        const head = `${row[0] ?? ""} ${row[1] ?? ""}`.replace(/\s/g, "");
        // 합계 줄은 따로 더하면 두 번 세게 된다.
        if (/^(계|합계|소계|총계)/.test(head) || /계$/.test(`${row[0] ?? ""}`.replace(/\s/g, ""))) {
          continue;
        }
        const value = parseNumber(row[period.index] ?? "");
        if (value === null) continue;
        seen = true;
        if (/내수|국내/.test(head)) domestic += value;
        else overseas += value;
      }
      const total = domestic + overseas;
      if (!seen || total <= 0) continue;
      rows.push({
        year: period.year,
        label: period.label,
        domestic: domestic * scale,
        overseas: overseas * scale,
        total: total * scale,
        overseasShare: (overseas / total) * 100,
      });
    }

    if (rows.length > 0) return { rows, unitNote: table.unitNote };
  }
  return { rows: [], unitNote: "" };
}

/**
 * 가격 변동 표. 회사에 따라 단가를 숫자로 적기도 하고
 * 삼성전자처럼 "전년 대비 4% 상승" 이라고 글로 적기도 한다. 둘 다 받는다.
 */
function readPriceChanges(tables: ReportTable[], fiscalYear: number): PriceRow[] {
  for (const table of tables) {
    const header = headerText(table).replace(/\s/g, "");
    const caption = table.caption.replace(/\s/g, "");
    const isPriceTable =
      /가격변동|가격추이|가격현황/.test(header) || /가격변동|가격추이/.test(caption);
    // 원재료 매입가는 제품 가격이 아니다.
    if (!isPriceTable || /원재료|매입/.test(`${header}${caption}`)) continue;

    const periods = periodColumns(table, fiscalYear);
    const body = table.grid.slice(table.headerRows);
    const rows: PriceRow[] = [];

    for (const row of body) {
      const item = (row[0] ?? "").trim();
      if (!item || /^(계|합계|소계|※)/.test(item)) continue;
      const values = (
        periods.length > 0
          ? periods
          : row.slice(1).map((_, index) => ({ index: index + 1, label: "", year: null }))
      )
        .map((period) => {
          const text = (row[period.index] ?? "").trim();
          return {
            label: period.label,
            year: period.year,
            text,
            value: isNumericCell(text) ? parseNumber(text) : null,
          };
        })
        .filter((value) => value.text.length > 0);
      if (values.length > 0) rows.push({ item, values });
    }
    if (rows.length > 0) return rows;
  }
  return [];
}

/** 수주잔고. 건설·조선처럼 수주산업만 싣는다. 없으면 빈 배열이다. */
function readBacklog(tables: ReportTable[]): BacklogRow[] {
  for (const table of tables) {
    const header = headerText(table).replace(/\s/g, "");
    if (!/수주잔고|수주총액|수주액/.test(header)) continue;

    const columns = table.grid[0]?.length ?? 0;
    const labels = table.grid
      .slice(0, Math.max(table.headerRows, 1))
      .at(-1) ?? [];
    const rows: BacklogRow[] = [];
    for (const row of table.grid.slice(table.headerRows)) {
      const item = (row[0] ?? "").trim();
      if (!item) continue;
      const values = [];
      for (let column = 1; column < columns; column++) {
        const text = (row[column] ?? "").trim();
        if (text) values.push({ label: (labels[column] ?? "").trim(), text });
      }
      if (values.length > 0) rows.push({ item, values });
    }
    if (rows.length > 0) return rows;
  }
  return [];
}

export type SubsidiaryFinancialRow = {
  name: string;
  /** 이 값이 걸린 사업연도. 반기·분기 보고서의 "당반기/당분기"는 그 기간이 속한 해다. */
  year: number | null;
  /** 이 값이 사업연도 안에서 몇 분기 시점까지의 누적인지. 사업보고서=4, 반기보고서=2,
   * 분기보고서는 1 또는 3. 매출·순손익이 분기 단독 실적인지 누적인지 가르는 열쇠다. */
  quarterIndex: 1 | 2 | 3 | 4;
  /** "2025년 2분기", "2025년"(연간) 처럼 표에 붙일 이름 */
  periodLabel: string;
  assets: number | null;
  liabilities: number | null;
  /** 사업연도 시작부터 이 시점까지의 누적치. 분기·반기 보고서는 그대로 누적이라,
   * 분기 단독 실적을 보려면 직전 분기 누적을 빼야 한다(report-analysis.ts 에서 처리). */
  revenue: number | null;
  netIncome: number | null;
};

const PRIOR_PERIOD = /제\s*\d+\s*\(전\)\s*기/;

/**
 * 연결재무제표 주석의 "종속기업의 요약재무정보" 표. 개별 종속회사(휴젤아메리카 같은)의
 * 매출·순손익을 여기서만 볼 수 있다. 정형 API 는 연결 전체 숫자만 준다.
 *
 * 사업보고서·반기보고서뿐 아니라 분기보고서(1·3분기)에도 이 노트가 실린다. 매출·
 * 순손익은 사업연도 시작부터의 누적치이므로 여기서는 원문 값 그대로만 뽑고, 분기
 * 단독 실적으로 바꾸는 일은 여러 보고서를 함께 보는 report-analysis.ts 에 맡긴다.
 *
 * 이 표는 "당기"와 "전기" 두 벌을 나란히 싣는데, 표 앞의 "① 제 26(당) 기 반기" 같은
 * 표시가 caption 으로 잡히지 않는 경우가 있어(다른 후보 문장이 정규식에 먼저 걸려서)
 * context 전체를 훑어 당기·전기를 가른다.
 */
function readSubsidiaryFinancials(
  tables: ReportTable[],
  report: { fiscalYear: number; kind: string; quarterIndex: 1 | 2 | 3 | 4 },
): SubsidiaryFinancialRow[] {
  const rows: SubsidiaryFinancialRow[] = [];

  for (const table of tables) {
    const header = headerText(table).replace(/\s/g, "");
    // 회사마다 "종속기업명"을 "기업명"으로, "매출액"을 "수익"으로, "자산/부채"를
    // "자산총계/부채총계"로 줄여 쓴다(파마리서치 사례). 이름·자산·부채·매출·순손익
    // 다섯 조건을 한 표에서 모두 만족할 때만 이 노트로 본다.
    if (!/종속기업명|기업명/.test(header)) continue;
    if (!/자산/.test(header)) continue;
    if (!/부채/.test(header)) continue;
    if (!/매출액|수익/.test(header)) continue;
    if (!/순손익|순이익/.test(header)) continue;

    const headerCells = table.grid.slice(0, table.headerRows);
    const findColumn = (pattern: RegExp) => {
      for (let column = 0; column < (table.grid[0]?.length ?? 0); column++) {
        if (headerCells.some((row) => pattern.test((row[column] ?? "").replace(/\s/g, "")))) {
          return column;
        }
      }
      return -1;
    };
    const assetsColumn = findColumn(/^자산(총계)?$/);
    const liabilitiesColumn = findColumn(/^부채(총계)?$/);
    const revenueColumn = findColumn(/매출액|수익/);
    const netIncomeColumn = findColumn(/순손익|순이익/);
    if (revenueColumn < 0 && netIncomeColumn < 0) continue;

    const scale = unitScale(table.unitNote);
    const isPrior = PRIOR_PERIOD.test(table.context);
    // "제 N(당) 기"처럼 당기·전기를 나눈 표시가 없는 회사는 표 하나에 "당반기말
    // 현재"처럼 이 시점 값만 싣는다. 이때는 이 보고서 자신의 시점(당기)으로 본다.
    const year = isPrior ? report.fiscalYear - 1 : report.fiscalYear;

    for (const row of table.grid.slice(table.headerRows)) {
      // 각주 번호 "(*1)" 앞뒤 공백이 표마다 들쭉날쭉해서, 그대로 두면 같은 회사가
      // 당기·전기 표에서 다른 이름으로 갈려 표가 두 줄로 쪼개진다.
      const name = (row[0] ?? "").replace(/\s*\(\*\d+\)\s*$/, "").trim();
      if (!name || /^(계|합계|소계)/.test(name)) continue;
      const scaled = (column: number) => {
        if (column < 0) return null;
        const value = parseNumber(row[column] ?? "");
        return value === null ? null : value * scale;
      };
      const revenue = scaled(revenueColumn);
      const netIncome = scaled(netIncomeColumn);
      if (revenue === null && netIncome === null) continue;

      rows.push({
        name,
        year,
        quarterIndex: report.quarterIndex,
        periodLabel:
          report.kind === "annual" ? `${year}년` : `${year}년 ${report.quarterIndex}분기`,
        assets: scaled(assetsColumn),
        liabilities: scaled(liabilitiesColumn),
        revenue,
        netIncome,
      });
    }
  }
  return rows;
}

/**
 * 보고서 하나에서 본문 지표를 모두 뽑는다.
 *
 * 가동률·해외매출·가격변동·수주잔고는 "II. 사업의 내용"에만 있고, 종속기업 실적은
 * "III. 재무에 관한 사항"의 연결재무제표 주석에 있다. 두 구간을 따로 찾는다.
 */
export function readReportMetrics(
  sections: ReportSection[],
  report: { fiscalYear: number; kind: string; quarterIndex: 1 | 2 | 3 | 4 },
): ReportMetrics {
  const business = findSection(sections, "사업의 내용")?.tables ?? [];
  const finance = findSection(sections, "재무에 관한 사항")?.tables ?? [];
  const regional = readRegionalSales(business, report.fiscalYear);

  return {
    utilization: readUtilization(business, report.fiscalYear),
    regionalSales: regional.rows,
    priceChanges: readPriceChanges(business, report.fiscalYear),
    backlog: readBacklog(business),
    subsidiaries: readSubsidiaryFinancials(finance, report),
    salesUnitNote: regional.unitNote,
  };
}
