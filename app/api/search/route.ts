import { NextResponse } from "next/server";
import { searchCorps } from "@/lib/corp-code";
import { DartError, hasApiKey } from "@/lib/dart";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 1) return NextResponse.json({ results: [] });

  if (!hasApiKey()) {
    return NextResponse.json(
      { error: "DART_API_KEY가 설정되지 않았습니다.", results: [] },
      { status: 503 },
    );
  }

  try {
    const results = await searchCorps(query);
    return NextResponse.json({ results });
  } catch (error) {
    const message =
      error instanceof DartError ? error.message : "기업 목록을 불러오지 못했습니다.";
    return NextResponse.json({ error: message, results: [] }, { status: 502 });
  }
}
