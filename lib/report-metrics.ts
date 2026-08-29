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

/** 보고서 하나에서 본문 지표를 모두 뽑는다. */
export function readReportMetrics(
  sections: ReportSection[],
  fiscalYear: number,
): ReportMetrics {
  const business = findSection(sections, "사업의 내용");
  const tables = business?.tables ?? [];
  const regional = readRegionalSales(tables, fiscalYear);

  return {
    utilization: readUtilization(tables, fiscalYear),
    regionalSales: regional.rows,
    priceChanges: readPriceChanges(tables, fiscalYear),
    backlog: readBacklog(tables),
    salesUnitNote: regional.unitNote,
  };
}
