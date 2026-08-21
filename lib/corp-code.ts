import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { dartBinary } from "./dart";

export type CorpEntry = {
  corpCode: string;
  corpName: string;
  corpEngName: string;
  stockCode: string;
  modifyDate: string;
  /** 검색용 정규화 키. 11만 건을 매 요청마다 정규화하지 않도록 파싱 때 한 번만 만든다. */
  nameKey: string;
  engKey: string;
};

// 서버리스 환경에서는 프로젝트 디렉터리가 읽기 전용이라 임시 디렉터리를 쓴다.
const CACHE_DIR = path.join(os.tmpdir(), "anta-research");
const CACHE_FILE = path.join(CACHE_DIR, "corp-code.json");
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

type CacheShape = { fetchedAt: number; entries: CorpEntry[] };

let memoryCache: CacheShape | null = null;
let inflight: Promise<CorpEntry[]> | null = null;

const FIELD = /<([a-z_]+)>([\s\S]*?)<\/\1>/g;

const ENTITY: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1]?.toLowerCase() === "x"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITY[body.toLowerCase()] ?? match;
  });
}

function parseCorpCodeXml(xml: string): CorpEntry[] {
  const entries: CorpEntry[] = [];
  const blocks = xml.split("<list>");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const fields: Record<string, string> = {};
    FIELD.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FIELD.exec(block)) !== null) {
      fields[match[1]] = decodeEntities(match[2].trim());
    }
    const corpCode = fields.corp_code;
    const corpName = fields.corp_name;
    if (!corpCode || !corpName) continue;
    const corpEngName = fields.corp_eng_name ?? "";
    entries.push({
      corpCode,
      corpName,
      corpEngName,
      stockCode: fields.stock_code ?? "",
      modifyDate: fields.modify_date ?? "",
      nameKey: normalize(corpName),
      engKey: normalize(corpEngName),
    });
  }
  return entries;
}

async function readDiskCache(): Promise<CacheShape | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CacheShape;
    if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeDiskCache(cache: CacheShape): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache), "utf8");
  } catch {
    // 캐시 저장 실패는 조회를 막지 않는다.
  }
}

async function download(): Promise<CorpEntry[]> {
  const zipped = await dartBinary("corpCode.xml");
  const files = unzipSync(zipped);
  const xmlName = Object.keys(files).find((name) => name.toLowerCase().endsWith(".xml"));
  if (!xmlName) throw new Error("corpCode.zip 안에서 XML 파일을 찾지 못했습니다.");
  const xml = new TextDecoder("utf-8").decode(files[xmlName]);
  const entries = parseCorpCodeXml(xml);
  memoryCache = { fetchedAt: Date.now(), entries };
  await writeDiskCache(memoryCache);
  return entries;
}

/** 전체 고유번호 목록. 메모리 → 디스크 → DART 순으로 조회하고 24시간 캐싱한다. */
export async function loadCorpEntries(): Promise<CorpEntry[]> {
  if (memoryCache && Date.now() - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.entries;
  }
  if (!memoryCache) {
    const disk = await readDiskCache();
    if (disk && Date.now() - disk.fetchedAt < CACHE_TTL_MS) {
      memoryCache = disk;
      return disk.entries;
    }
  }
  inflight ??= download().finally(() => {
    inflight = null;
  });
  try {
    return await inflight;
  } catch (error) {
    if (memoryCache) return memoryCache.entries;
    const disk = await readDiskCache();
    if (disk) return disk.entries;
    throw error;
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/주식회사|\(주\)|㈜|[\s.,\-_]/g, "");
}

export async function searchCorps(query: string, limit = 20): Promise<CorpEntry[]> {
  const needle = normalize(query);
  if (!needle) return [];
  const entries = await loadCorpEntries();

  const trimmed = query.trim();
  const scored: Array<{ entry: CorpEntry; score: number }> = [];
  for (const entry of entries) {
    const { nameKey, engKey } = entry;
    let score = -1;
    if (nameKey === needle) score = 0;
    else if (entry.stockCode === trimmed) score = 0;
    else if (nameKey.startsWith(needle)) score = 1;
    else if (nameKey.includes(needle)) score = 2;
    else if (engKey && engKey.startsWith(needle)) score = 3;
    else if (engKey && engKey.includes(needle)) score = 4;
    if (score < 0) continue;
    // 상장사를 우선 노출한다.
    if (!entry.stockCode) score += 5;
    scored.push({ entry, score });
  }

  scored.sort(
    (a, b) => a.score - b.score || a.entry.corpName.length - b.entry.corpName.length,
  );
  return scored.slice(0, limit).map((item) => item.entry);
}
