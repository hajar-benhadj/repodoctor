// Enqueues two repository analyses for a head-to-head comparison.
// Reuses the same queue and idempotency as single analyses.

import { NextResponse } from "next/server";
import { getQueue } from "@/lib/queue";
import { parseRepoUrl } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { a?: string; b?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const a = (body.a ?? "").trim();
  const b = (body.b ?? "").trim();
  if (!a || !b) {
    return NextResponse.json({ error: "Provide two repository URLs." }, { status: 400 });
  }
  if (!parseRepoUrl(a) || !parseRepoUrl(b)) {
    return NextResponse.json(
      { error: "Both fields must be github.com/owner/repository URLs." },
      { status: 400 }
    );
  }
  const queue = getQueue();
  const ja = queue.enqueue(a);
  const jb = queue.enqueue(b);
  return NextResponse.json(
    { a: ja.job, b: jb.job, cached: ja.cached && jb.cached },
    { status: 202 }
  );
}
