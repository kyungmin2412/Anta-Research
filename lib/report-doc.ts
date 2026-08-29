import { unzipSync } from "fflate";
import { dartBinary } from "./dart";

/**
 * 공시서류 원문(document.xml)을 표로 바꾸는 공통 뼈대.
 *
 * DART 원문은 이름만 xml 이고 실제로는 ZIP 이다. 안에는 본문 XML 한 개와 첨부 몇 개가
 * 들어 있고, 본문 파일 이름이 접수번호와 같다. 인코딩은 UTF-8, 표는 HTML 과 같은
 * TABLE/TR/TH/TD 에 ROWSPAN·COLSPAN 을 쓴다. 목차는 SECTION-1 안의 TITLE 로 나뉜다.
 */

export type ReportTable = {
  /** 표 바로 앞에 오는 소제목. 없을 수 있다. */
  caption: string;
  /**
   * 표 앞 문단을 이어붙인 글. caption 이 그중 하나만 고르기 때문에, "① 제 26(당) 기
   * 반기"처럼 정규식에 안 걸리는 기간 표시를 찾으려면 이 필드를 따로 훑어야 한다.
   */
  context: string;
  /** "(단위 : 억원, %)" 처럼 표 앞이나 첫 줄에 적힌 단위 문구. */
  unitNote: string;
  /** 병합셀을 펼친 격자. 모든 줄의 칸 수가 같다. */
  grid: string[][];
  /** 머리글로 쓰인 줄 수 (TH 로만 이뤄진 앞줄들). */
  headerRows: number;
};

export type ReportSection = {
  title: string;
  tables: ReportTable[];
};

/** 원문 ZIP 에서 본문 XML 을 꺼낸다. */
export function extractDocumentXml(zip: Uint8Array, rceptNo: string): string {
  const files = unzipSync(zip);
  const names = Object.keys(files);
  // 본문 파일 이름은 접수번호와 같다. 나머지는 첨부(감사보고서 등)다.
  const main = names.find((name) => name === `${rceptNo}.xml`) ?? names[0];
  if (!main) throw new Error("원문 ZIP 이 비어 있습니다.");
  return new TextDecoder("utf-8").decode(files[main]);
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** 병합셀을 펼쳐 직사각형 격자로 만든다. ROWSPAN 이 걸린 칸은 아래 줄에도 같은 값을 채운다. */
function tableToGrid(html: string): { grid: string[][]; headerRows: number } {
  const rows = html.match(/<TR\b[\s\S]*?<\/TR>/gi) ?? [];
  const grid: string[][] = [];
  // [남은 줄 수, 값] 을 열 번호별로 들고 다닌다.
  const carry = new Map<number, { left: number; value: string }>();
  let headerRows = 0;
  let headerOpen = true;

  rows.forEach((row, rowIndex) => {
    const line: string[] = [];
    let column = 0;
    const take = () => {
      while (true) {
        const held = carry.get(column);
        if (!held || held.left <= 0) break;
        line[column] = held.value;
        held.left -= 1;
        if (held.left <= 0) carry.delete(column);
        column += 1;
      }
    };

    let onlyHeaderCells = true;
    for (const cell of row.matchAll(/<T(D|H)\b([^>]*)>([\s\S]*?)<\/T[DH]>/gi)) {
      take();
      if (cell[1].toUpperCase() !== "H") onlyHeaderCells = false;
      const attrs = cell[2];
      const value = stripTags(cell[3]);
      const rowSpan = Number(attrs.match(/ROWSPAN="(\d+)"/i)?.[1] ?? 1);
      const colSpan = Number(attrs.match(/COLSPAN="(\d+)"/i)?.[1] ?? 1);
      for (let n = 0; n < colSpan; n++) {
        line[column] = value;
        if (rowSpan > 1) carry.set(column, { left: rowSpan - 1, value });
        column += 1;
      }
    }
    take();

    if (headerOpen && onlyHeaderCells && line.length > 0) headerRows = rowIndex + 1;
    else headerOpen = false;

    grid.push(line);
  });

  const width = grid.reduce((max, line) => Math.max(max, line.length), 0);
  for (const line of grid) {
    for (let i = 0; i < width; i++) if (line[i] === undefined) line[i] = "";
  }
  return { grid, headerRows };
}

const UNIT_PATTERN = /\(\s*단위\s*[:：][^)]*\)/;

/**
 * 안쪽 표만 고른다. DART 는 주석과 진짜 표를 한 칸짜리 표로 한 번 더 감싸는 일이
 * 잦은데, 바깥 껍데기까지 표로 세면 주석 글이 머리글에 섞여 들어온다.
 */
const INNERMOST_TABLE = /<TABLE\b(?:(?!<\/?TABLE\b)[\s\S])*<\/TABLE>/gi;

/**
 * 표 하나를 읽는다. 단위와 소제목은 표 안에 없고 바로 앞 문단이나 한 칸짜리 표에 적혀
 * 있어서, 앞쪽 글을 같이 훑어야 한다.
 */
function readTable(html: string, before: string): ReportTable {
  const { grid, headerRows } = tableToGrid(html);

  // 표 앞에 놓인 글토막들. 단위와 소제목이 여기 섞여 있다.
  const texts = [...before.matchAll(/<(?:SPAN|P|TD)\b[^>]*>([\s\S]*?)<\/(?:SPAN|P|TD)>/gi)]
    .map((match) => stripTags(match[1]))
    .filter((text) => text.length > 0 && text.length <= 80);

  const unitSource =
    grid.flat().find((cell) => UNIT_PATTERN.test(cell)) ??
    [...texts].reverse().find((text) => UNIT_PATTERN.test(text)) ??
    "";
  const unitNote = unitSource.match(UNIT_PATTERN)?.[0] ?? "";

  // 소제목은 "가. 매출실적", "(3) 주요 지역별 매출 현황", "[주요 사업장 현황]" 꼴로 온다.
  // 단위 문구가 바로 앞에 오는 일이 잦아 그건 빼고 고른다.
  const candidates = texts.filter((text) => !UNIT_PATTERN.test(text));
  const caption =
    [...candidates].reverse().find((text) => /^([가-힣]\.|\(\d+\)|\[|\d+\.)/.test(text)) ??
    candidates.at(-1) ??
    "";

  return { caption, context: candidates.join(" "), unitNote, grid, headerRows };
}

/**
 * 본문 XML 을 목차 단위로 나눠 표까지 읽어 둔다.
 *
 * 표는 재무제표 주석에만 수백 개라, 필요한 목차만 넘기면 헛일을 크게 줄인다.
 */
export function parseReportDocument(xml: string, onlyTitles?: string[]): ReportSection[] {
  const sections: ReportSection[] = [];
  const starts = [...xml.matchAll(/<SECTION-1\b[^>]*>/g)].map((match) => match.index!);

  starts.forEach((start, index) => {
    const body = xml.slice(start, starts[index + 1] ?? xml.length);
    const title = stripTags(body.match(/<TITLE\b[^>]*>([\s\S]*?)<\/TITLE>/)?.[1] ?? "");

    const tables: ReportTable[] = [];
    if (onlyTitles && !onlyTitles.some((keyword) => title.includes(keyword))) {
      sections.push({ title, tables });
      return;
    }
    let cursor = 0;
    for (const match of body.matchAll(INNERMOST_TABLE)) {
      const table = readTable(match[0], body.slice(cursor, match.index!));
      // 단위만 적힌 한 칸짜리 표는 버리되 훑은 자리는 넘기지 않는다. 바로 뒤 표가
      // 그 단위를 읽어야 하기 때문이다.
      if (table.grid.length <= 1 && table.grid[0]?.length <= 1) continue;
      cursor = match.index! + match[0].length;
      tables.push(table);
    }
    sections.push({ title, tables });
  });

  return sections;
}

/** 접수번호로 원문을 받아 목차·표까지 읽는다. */
export async function getReportDocument(
  rceptNo: string,
  onlyTitles?: string[],
): Promise<ReportSection[]> {
  const zip = await dartBinary("document.xml", { rcept_no: rceptNo });
  return parseReportDocument(extractDocumentXml(zip, rceptNo), onlyTitles);
}

export function findSection(sections: ReportSection[], keyword: string) {
  return sections.find((section) => section.title.includes(keyword)) ?? null;
}
