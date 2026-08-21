"use client";

import { useRouter } from "next/navigation";
import CorpSearch from "./CorpSearch";

export default function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  return (
    <CorpSearch
      autoFocus={autoFocus}
      prefetchHref={(corp) => `/company/${corp.corpCode}`}
      onSelect={(corp) => router.push(`/company/${corp.corpCode}`)}
    />
  );
}
