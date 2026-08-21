const 억 = 100_000_000;
const 조 = 1_000_000_000_000;

/** 원 단위 금액을 "1조 2,345억" 같은 한국식 표기로 바꾼다. */
export function formatKrw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 조) {
    const jo = Math.floor(abs / 조);
    const rest = Math.round((abs % 조) / 억);
    return rest > 0
      ? `${sign}${jo.toLocaleString("ko-KR")}조 ${rest.toLocaleString("ko-KR")}억`
      : `${sign}${jo.toLocaleString("ko-KR")}조`;
  }
  if (abs >= 억) {
    const eok = Math.floor(abs / 억);
    const rest = Math.round((abs % 억) / 10_000);
    return eok < 100 && rest > 0
      ? `${sign}${eok.toLocaleString("ko-KR")}억 ${rest.toLocaleString("ko-KR")}만`
      : `${sign}${Math.round(abs / 억).toLocaleString("ko-KR")}억`;
  }
  if (abs >= 10_000) {
    return `${sign}${Math.round(abs / 10_000).toLocaleString("ko-KR")}만`;
  }
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}`;
}

/** 차트 축 등에서 쓰는 짧은 표기 */
export function formatKrwShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 조) return `${sign}${(abs / 조).toFixed(abs / 조 >= 10 ? 0 : 1)}조`;
  if (abs >= 억) return `${sign}${Math.round(abs / 억).toLocaleString("ko-KR")}억`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString("ko-KR")}만`;
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ko-KR");
}

/** "20240315" → "2024.03.15" */
export function formatDartDate(value: string | null | undefined): string {
  if (!value || value.length < 8) return value ?? "—";
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

export function yyyymmdd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
