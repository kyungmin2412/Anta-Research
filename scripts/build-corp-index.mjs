/**
 * 기업 고유번호 색인을 빌드 시점에 만들어 둔다.
 *
 * 이 파일이 없으면 서버가 뜰 때마다 DART에서 1.4MB짜리 목록을 새로 받아야 하고,
 * 트래픽이 적은 사이트는 인스턴스가 자주 새로 뜨는 탓에 사실상 검색할 때마다
 * 그 비용을 낸다. 미리 만들어 두면 다운로드가 통째로 사라진다.
 *
 * 인증키가 없으면 아무것도 만들지 않고 조용히 끝낸다. 이 경우 런타임이
 * 예전처럼 DART에서 직접 받아 쓰므로 빌드가 깨지지는 않는다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";

const OUT_DIR = path.join(process.cwd(), "data");
const OUT_FILE = path.join(OUT_DIR, "corp-index.tsv");
const BASE = process.env.DART_API_BASE ?? "https://opendart.fss.or.kr/api";

const FIELD = /<([a-z_]+)>([\s\S]*?)<\/\1>/g;
const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body.startsWith("#")) {
      const code =
        body[1]?.toLowerCase() === "x"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITY[body.toLowerCase()] ?? match;
  });
}

/** 탭과 줄바꿈은 구분자로 쓰므로 값에서 걷어낸다. */
function clean(value) {
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

async function main() {
  const key = process.env.DART_API_KEY;
  if (!key) {
    console.log("[corp-index] DART_API_KEY가 없어 색인을 건너뜁니다. 런타임에서 직접 받습니다.");
    return;
  }

  const url = new URL(`${BASE}/corpCode.xml`);
  url.searchParams.set("crtfc_key", key);

  const started = Date.now();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`DART 응답 오류 (HTTP ${res.status})`);
  const zipped = new Uint8Array(await res.arrayBuffer());

  // 인증키가 틀리면 zip 대신 XML 오류 문서가 온다.
  if (zipped[0] !== 0x50 || zipped[1] !== 0x4b) {
    const text = new TextDecoder().decode(zipped.slice(0, 400));
    throw new Error(`zip이 아닌 응답: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
  }

  const files = unzipSync(zipped);
  const name = Object.keys(files).find((item) => item.toLowerCase().endsWith(".xml"));
  if (!name) throw new Error("zip 안에 XML이 없습니다");
  const xml = new TextDecoder("utf-8").decode(files[name]);

  const lines = [];
  const blocks = xml.split("<list>");
  for (let i = 1; i < blocks.length; i++) {
    const fields = {};
    FIELD.lastIndex = 0;
    let match;
    while ((match = FIELD.exec(blocks[i])) !== null) {
      fields[match[1]] = decodeEntities(match[2].trim());
    }
    const corpCode = fields.corp_code;
    const corpName = fields.corp_name;
    if (!corpCode || !corpName) continue;
    lines.push(
      [
        corpCode,
        clean(corpName),
        clean(fields.corp_eng_name ?? ""),
        clean(fields.stock_code ?? ""),
      ].join("\t"),
    );
  }

  if (lines.length === 0) throw new Error("색인이 비었습니다");

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
  const mb = (Buffer.byteLength(lines.join("\n")) / 1024 / 1024).toFixed(2);
  console.log(
    `[corp-index] ${lines.length.toLocaleString()}건 · ${mb}MB · ${Date.now() - started}ms`,
  );
}

main().catch((error) => {
  // 색인을 못 만들어도 런타임이 DART에서 직접 받을 수 있으니 빌드는 계속한다.
  console.warn(`[corp-index] 색인 생성 실패, 런타임에서 직접 받습니다: ${error.message}`);
});
