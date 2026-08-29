"use client";

import { useRouter } from "next/navigation";
import CorpSearch from "./CorpSearch";

/** 개별 기업 분석 탭의 검색창. 재무 화면 대신 보고서 화면으로 보낸다. */
export default function ReportSearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  return (
    <CorpSearch
      autoFocus={autoFocus}
      prefetchHref={(corp) => `/analysis/${corp.corpCode}`}
      onSelect={(corp) => router.push(`/analysis/${corp.corpCode}`)}
    />
  );
}
