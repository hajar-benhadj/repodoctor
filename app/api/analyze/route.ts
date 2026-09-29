import { NextResponse } from "next/server";
import { getQueue } from "@/lib/queue";
import { parseRepoUrl } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const url = (body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "Provide a repository URL." }, { status: 400 });
  }
  const parsed = parseRepoUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: "That doesn't look like a GitHub repository. Expected github.com/owner/repository." },
      { status: 400 }
    );
  }
  const { job, cached } = getQueue().enqueue(url);
  return NextResponse.json({ job, cached }, { status: cached ? 200 : 202 });
}
