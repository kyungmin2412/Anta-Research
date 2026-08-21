import { dartJson, dartJsonOptional, REPORT_CODE } from "./dart";
import { latestBusinessYear } from "./finance";
import { yyyymmdd } from "./format";

export type CompanyProfile = {
  status: string;
  message: string;
  corp_name: string;
  corp_name_eng: string;
  stock_name: string;
  stock_code: string;
  ceo_nm: string;
  corp_cls: string;
  jurir_no: string;
  bizr_no: string;
  adres: string;
  hm_url: string;
  ir_url: string;
  phn_no: string;
  fax_no: string;
  induty_code: string;
  est_dt: string;
  acc_mt: string;
};

export const CORP_CLASS_LABEL: Record<string, string> = {
  Y: "유가증권시장",
  K: "코스닥",
  N: "코넥스",
  E: "기타법인",
};

export async function getCompanyProfile(corpCode: string): Promise<CompanyProfile> {
  return dartJson<CompanyProfile>("company.json", { corp_code: corpCode }, 60 * 60 * 24);
}

export type Disclosure = {
  corp_name: string;
  report_nm: string;
  rcept_no: string;
  flr_nm: string;
  rcept_dt: string;
  rm: string;
};

export async function getDisclosures(
  corpCode: string,
  months = 12,
  pageCount = 20,
): Promise<Disclosure[]> {
  const end = new Date();
  const begin = new Date();
  begin.setMonth(begin.getMonth() - months);

  const data = await dartJsonOptional<{
    status: string;
    message: string;
    list?: Disclosure[];
  }>(
    "list.json",
    {
      corp_code: corpCode,
      bgn_de: yyyymmdd(begin),
      end_de: yyyymmdd(end),
      page_count: pageCount,
      page_no: 1,
    },
    60 * 30,
  );
  return data?.list ?? [];
}

export type DividendRow = {
  se: string;
  stock_knd?: string;
  thstrm: string;
  frmtrm: string;
  lwfr: string;
};

export async function getDividends(
  corpCode: string,
  year: number,
): Promise<DividendRow[]> {
  const data = await dartJsonOptional<{
    status: string;
    message: string;
    list?: DividendRow[];
  }>(
    "alotMatter.json",
    { corp_code: corpCode, bsns_year: year, reprt_code: REPORT_CODE.ANNUAL },
    60 * 60 * 24,
  );
  return data?.list ?? [];
}

export type MajorShareholder = {
  nm: string;
  relate: string;
  stock_knd: string;
  trmend_posesn_stock_co: string;
  trmend_posesn_stock_qota_rt: string;
};

export async function getMajorShareholders(
  corpCode: string,
  year: number,
): Promise<MajorShareholder[]> {
  const data = await dartJsonOptional<{
    status: string;
    message: string;
    list?: MajorShareholder[];
  }>(
    "hyslrSttus.json",
    { corp_code: corpCode, bsns_year: year, reprt_code: REPORT_CODE.ANNUAL },
    60 * 60 * 24,
  );
  return data?.list ?? [];
}

export type EmployeeRow = {
  fo_bbm: string;
  sexdstn: string;
  sm: string;
  avrg_cnwk_sdytrn: string;
  fyer_salary_totamt: string;
  jan_salary_am: string;
};

export async function getEmployees(
  corpCode: string,
  year: number,
): Promise<EmployeeRow[]> {
  const data = await dartJsonOptional<{
    status: string;
    message: string;
    list?: EmployeeRow[];
  }>(
    "empSttus.json",
    { corp_code: corpCode, bsns_year: year, reprt_code: REPORT_CODE.ANNUAL },
    60 * 60 * 24,
  );
  return data?.list ?? [];
}

/**
 * 최신 사업보고서 기준 데이터를 가져온다.
 * 아직 제출 전이라 비어 있으면 직전 연도로 한 번 더 시도한다.
 */
export async function latestReport<T>(
  fetcher: (year: number) => Promise<T[]>,
): Promise<{ year: number; rows: T[] }> {
  const latest = latestBusinessYear();
  for (const year of [latest, latest - 1]) {
    const rows = await fetcher(year).catch(() => []);
    if (rows.length > 0) return { year, rows };
  }
  return { year: latest, rows: [] };
}

export function parseCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
