import { NextResponse } from "next/server";
import { getQueue } from "@/lib/queue";
import { getResult } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getQueue().get(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (job.status === "done" && job.resultId) {
    const result = getResult(job.resultId);
    if (result) return NextResponse.json({ job, result });
  }
  return NextResponse.json({ job });
}
