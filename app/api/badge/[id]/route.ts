// shields.io-style SVG badge for a completed analysis.
// Accepts both a result id and a job id (resolved through the job's resultId).

import { getResult, getJob } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gradeColor(grade: string): string {
  if (grade === "A+") return "#4c1";
  if (grade === "A") return "#97ca00";
  if (grade === "B") return "#a4a61d";
  if (grade === "C") return "#dfb317";
  if (grade === "D") return "#fe7d37";
  return "#e05d44";
}

const FONT = "Verdana,Geneva,DejaVu Sans,sans-serif";

function textWidth(s: string): number {
  // conservative width estimate at 11px Verdana
  let w = 0;
  for (const ch of s) w = ch === " " || ch === "·" ? w + 3.5 : w + 7;
  return Math.round(w);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = getResult(id) ?? (getJob(id)?.resultId ? getResult(getJob(id)!.resultId!) : null);
  if (!result) {
    return new Response("Analysis not found", { status: 404 });
  }
  const { grade, overall } = result.scores;
  const label = "RepoDoctor";
  const value = `${grade} · ${overall}%`;
  const lw = textWidth(label) + 16;
  const rw = textWidth(value) + 16;
  const w = lw + rw;
  const color = gradeColor(grade);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="#555"/>
    <rect x="${lw}" width="${rw}" height="20" fill="${color}"/>
    <rect width="${w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="${FONT}" font-size="110" text-rendering="geometricPrecision">
    <text transform="scale(.1)" x="${lw * 5}" y="150" fill="#010101" fill-opacity=".3" textLength="${(lw - 16) * 10}" lengthAdjust="spacingAndGlyphs">${label}</text>
    <text transform="scale(.1)" x="${lw * 5}" y="140" textLength="${(lw - 16) * 10}" lengthAdjust="spacingAndGlyphs">${label}</text>
    <text transform="scale(.1)" x="${(lw + rw / 2) * 10}" y="150" fill="#010101" fill-opacity=".3" textLength="${(rw - 16) * 10}" lengthAdjust="spacingAndGlyphs">${value}</text>
    <text transform="scale(.1)" x="${(lw + rw / 2) * 10}" y="140" textLength="${(rw - 16) * 10}" lengthAdjust="spacingAndGlyphs">${value}</text>
  </g>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
