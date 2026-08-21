const DART_BASE = "https://opendart.fss.or.kr/api";

export const DART_STATUS_MESSAGE: Record<string, string> = {
  "000": "정상",
  "010": "등록되지 않은 인증키입니다.",
  "011": "사용할 수 없는 인증키입니다. (일시적 사용중지)",
  "012": "접근할 수 없는 IP입니다.",
  "013": "조회된 데이터가 없습니다.",
  "014": "파일이 존재하지 않습니다.",
  "020": "요청 제한을 초과했습니다. (일 20,000건)",
  "021": "조회 가능한 회사 개수가 초과했습니다.",
  "100": "필드의 부적절한 값입니다.",
  "101": "부적절한 접근입니다.",
  "800": "시스템 점검으로 서비스가 중지 중입니다.",
  "900": "정의되지 않은 오류가 발생했습니다.",
  "901": "사용자 계정이 존재하지 않습니다.",
};

export class DartError extends Error {
  constructor(
    readonly status: string,
    message: string,
  ) {
    super(message);
    this.name = "DartError";
  }
}

export function getApiKey(): string {
  const key = process.env.DART_API_KEY;
  if (!key) {
    throw new DartError(
      "NO_KEY",
      "DART_API_KEY 환경변수가 설정되지 않았습니다. .env.local 파일에 발급받은 키를 넣어주세요.",
    );
  }
  return key;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.DART_API_KEY);
}

type DartResponse = { status: string; message: string };

/** DART 오픈API의 JSON 엔드포인트를 호출한다. status !== "000" 이면 DartError를 던진다. */
export async function dartJson<T extends DartResponse>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  revalidate = 60 * 60,
): Promise<T> {
  const url = new URL(`${DART_BASE}/${endpoint}`);
  url.searchParams.set("crtfc_key", getApiKey());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) {
    throw new DartError(String(res.status), `DART 서버 응답 오류 (HTTP ${res.status})`);
  }

  const data = (await res.json()) as T;
  if (data.status !== "000") {
    throw new DartError(
      data.status,
      DART_STATUS_MESSAGE[data.status] ?? data.message ?? "알 수 없는 오류",
    );
  }
  return data;
}

/** 조회 결과가 없을 때(013) null을 돌려주는 관대한 버전. */
export async function dartJsonOptional<T extends DartResponse>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  revalidate?: number,
): Promise<T | null> {
  try {
    return await dartJson<T>(endpoint, params, revalidate);
  } catch (error) {
    if (error instanceof DartError && error.status === "013") return null;
    throw error;
  }
}

export async function dartBinary(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<Uint8Array> {
  const url = new URL(`${DART_BASE}/${endpoint}`);
  url.searchParams.set("crtfc_key", getApiKey());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new DartError(String(res.status), `DART 서버 응답 오류 (HTTP ${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** 보고서 종류 코드 */
export const REPORT_CODE = {
  Q1: "11013",
  HALF: "11012",
  Q3: "11014",
  ANNUAL: "11011",
} as const;

export type ReportCode = (typeof REPORT_CODE)[keyof typeof REPORT_CODE];

export const REPORT_LABEL: Record<string, string> = {
  "11013": "1분기보고서",
  "11012": "반기보고서",
  "11014": "3분기보고서",
  "11011": "사업보고서",
};

export function dartViewerUrl(rceptNo: string): string {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`;
}
