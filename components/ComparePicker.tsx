"use client";

import { useRouter } from "next/navigation";
import { MAX_COMPARE } from "@/lib/compare";
import CorpSearch from "./CorpSearch";

export default function ComparePicker({
  codes,
  granularity,
}: {
  codes: string[];
  granularity: "annual" | "quarter";
}) {
  const router = useRouter();
  const full = codes.length >= MAX_COMPARE;

  if (full) {
    return (
      <p className="rounded-xl bg-grey-100 px-4 py-3 text-[14px] text-grey-600">
        최대 {MAX_COMPARE}곳까지 비교할 수 있어요. 하나를 빼면 다른 기업을 넣을 수
        있습니다.
      </p>
    );
  }

  return (
    <CorpSearch
      size="small"
      excluded={codes}
      placeholder="비교할 기업을 검색해 추가하세요"
      onSelect={(corp) => {
        const next = [...codes, corp.corpCode].join(",");
        const suffix = granularity === "quarter" ? "&p=q" : "";
        router.push(`/compare?codes=${next}${suffix}`);
      }}
    />
  );
}
