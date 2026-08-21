import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="text-[40px]">🔍</div>
      <h1 className="mt-4 text-[22px] font-bold text-grey-900">기업을 찾지 못했어요</h1>
      <p className="mt-2 text-[15px] text-grey-600">
        고유번호가 올바른지 확인하고 다시 검색해 주세요.
      </p>
      <Link href="/" className="btn-primary mt-6 px-5 py-3 text-[15px]">
        검색하러 가기
      </Link>
    </div>
  );
}
