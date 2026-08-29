"use client";

/**
 * 표를 CSV 로 내려받는 버튼. 엑셀이 CSV 를 그대로 열 수 있어 별도 xlsx 라이브러리
 * 없이도 "엑셀로 다운로드"가 된다. 한글이 깨지지 않도록 UTF-8 BOM 을 붙인다.
 */
export function DownloadCsvButton({
  filename,
  rows,
  label = "엑셀로 다운로드",
}: {
  filename: string;
  rows: Array<Array<string | number | null>>;
  label?: string;
}) {
  const handleClick = () => {
    const escape = (value: string | number | null) => {
      if (value === null || value === undefined) return "";
      const text = String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
    const bom = String.fromCharCode(0xfeff);
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-grey-700 shadow-card ring-1 ring-grey-100 hover:bg-grey-100"
    >
      {label}
    </button>
  );
}
