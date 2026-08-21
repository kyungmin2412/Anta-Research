"use client";

import Link from "next/link";

export default function CompanyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="text-[40px]">🥲</div>
      <h1 className="mt-4 text-[22px] font-bold text-grey-900">
        데이터를 불러오지 못했어요
      </h1>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-grey-600">
        {error.message || "DART 서버와 통신하는 중 문제가 발생했습니다."}
      </p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="btn-primary px-5 py-3 text-[15px]"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="rounded-xl bg-white px-5 py-3 text-[15px] font-semibold text-grey-700 shadow-card ring-1 ring-grey-100 hover:bg-grey-100"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
