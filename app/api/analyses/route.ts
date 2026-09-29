import { NextResponse } from "next/server";
import { listRecentResults } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const results = listRecentResults(8).map((r) => ({
    id: r.id,
    owner: r.repo.owner,
    repo: r.repo.name,
    overall: r.scores.overall,
    grade: r.scores.grade,
    analyzedAt: r.analyzedAt,
  }));
  return NextResponse.json({ results });
}
