"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type CorpResult = {
  corpCode: string;
  corpName: string;
  corpEngName: string;
  stockCode: string;
};

/**
 * 기업 검색 입력창과 결과 목록. 고른 뒤 무엇을 할지는 쓰는 쪽이 정한다.
 */
export default function CorpSearch({
  onSelect,
  prefetchHref,
  placeholder = "기업명 또는 종목코드를 입력하세요",
  autoFocus = false,
  size = "large",
  excluded = [],
}: {
  onSelect: (corp: CorpResult) => void;
  /** 주면 결과에 마우스를 올리거나 키보드로 짚을 때 그 화면을 미리 받아 둔다. */
  prefetchHref?: (corp: CorpResult) => string;
  placeholder?: string;
  autoFocus?: boolean;
  size?: "large" | "small";
  excluded?: string[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CorpResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const prefetched = useRef(new Set<string>());

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setResults(data.results ?? []);
        setError(data.error ?? null);
        setHighlight(0);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("검색에 실패했어요. 잠시 후 다시 시도해 주세요.");
        }
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const visible = results.filter((item) => !excluded.includes(item.corpCode));

  // 누르기 전에 미리 받아 두면 클릭 순간 화면이 바로 뜬다. 같은 회사는 한 번만.
  function warm(corp: CorpResult) {
    if (!prefetchHref || prefetched.current.has(corp.corpCode)) return;
    prefetched.current.add(corp.corpCode);
    router.prefetch(prefetchHref(corp));
  }

  function choose(corp: CorpResult) {
    setOpen(false);
    setQuery("");
    onSelect(corp);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || visible.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = (highlight + 1) % visible.length;
      setHighlight(next);
      warm(visible[next]);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = (highlight - 1 + visible.length) % visible.length;
      setHighlight(next);
      warm(visible[next]);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(visible[Math.min(highlight, visible.length - 1)]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const large = size === "large";

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center gap-3 bg-white shadow-card ring-1 ring-grey-100 focus-within:ring-2 focus-within:ring-blue-500 ${
          large ? "rounded-2xl px-5" : "rounded-xl px-4"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={`shrink-0 text-grey-400 ${large ? "h-5 w-5" : "h-4 w-4"}`}
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path
            d="m16.5 16.5 4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <input
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => visible.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={`w-full bg-transparent font-medium text-grey-900 outline-none placeholder:font-normal placeholder:text-grey-400 ${
            large ? "h-16 text-[17px]" : "h-12 text-[15px]"
          }`}
          aria-label="기업 검색"
        />
        {loading && (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-grey-200 border-t-blue-500" />
        )}
      </div>

      {open && (visible.length > 0 || error || (!loading && query.trim())) && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl bg-white p-2 shadow-float ring-1 ring-grey-100">
          {error ? (
            <p className="px-4 py-5 text-[14px] text-grey-500">{error}</p>
          ) : visible.length === 0 ? (
            <p className="px-4 py-5 text-[14px] text-grey-500">검색 결과가 없어요.</p>
          ) : (
            <ul className="thin-scroll max-h-[380px] overflow-y-auto">
              {visible.map((item, index) => (
                <li key={item.corpCode}>
                  <button
                    type="button"
                    onMouseEnter={() => {
                      setHighlight(index);
                      warm(item);
                    }}
                    onClick={() => choose(item)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                      index === highlight ? "bg-grey-100" : "bg-transparent"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-grey-900">
                        {item.corpName}
                      </span>
                      {item.corpEngName && (
                        <span className="block truncate text-[13px] text-grey-500">
                          {item.corpEngName}
                        </span>
                      )}
                    </span>
                    {item.stockCode ? (
                      <span className="tnum shrink-0 rounded-md bg-blue-100 px-2 py-1 text-[12px] font-semibold text-blue-700">
                        {item.stockCode}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-md bg-grey-100 px-2 py-1 text-[12px] font-medium text-grey-500">
                        비상장
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
