import { dartJson } from "./dart";

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
