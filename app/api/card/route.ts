// Shareable head-to-head card: a single SVG showing both contenders, grades,
// the per-category duel with winners highlighted, and the verdict.
// Accepts result ids or job ids for both sides.

import { getJob, getResult } from "@/lib/store";
import { AnalysisResult, CATEGORY_LABELS, Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const W = 860;
const H = 500;

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#0b1120";
const CARD_LINE = "#22304d";
const MUTED = "#7c8aa5";
const WIN = "#34d399";
const LOSE = "#526180";

function gradeColor(grade: string): string {
  if (grade === "A+") return "#4ade80";
  if (grade === "A") return "#34d399";
  if (grade === "B") return "#a3a635";
  if (grade === "C") return "#fbbf24";
  if (grade === "D") return "#fb923c";
  return "#fb7185";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function resolve(id: string): AnalysisResult | null {
  const direct = getResult(id);
  if (direct) return direct;
  const job = getJob(id);
  return job?.resultId ? getResult(job.resultId) : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = url.searchParams.get("a") ?? "";
  const b = url.searchParams.get("b") ?? "";
  const resA = resolve(a);
  const resB = resolve(b);
  if (!resA || !resB) {
    return new Response("Card not found — one or both analyses are missing.", { status: 404 });
  }

  const CATS: Category[] = ["quality", "security", "testing", "documentation", "maintainability"];
  const CAT_DOT: Record<Category, string> = {
    quality: "#38bdf8",
    security: "#fb7185",
    documentation: "#fbbf24",
    testing: "#34d399",
    maintainability: "#a78bfa",
  };
  const catA = (k: Category) => resA.scores.categories.find((c) => c.key === k)!;
  const catB = (k: Category) => resB.scores.categories.find((c) => c.key === k)!;

  let winsA = 0;
  let winsB = 0;
  for (const k of CATS) {
    const sa = catA(k).score;
    const sb = catB(k).score;
    if (sa > sb) winsA++;
    else if (sb > sa) winsB++;
  }
  const overallWinner =
    resA.scores.overall > resB.scores.overall ? "a" : resB.scores.overall > resA.scores.overall ? "b" : "tie";

  const nameA = `${resA.repo.owner}/${resA.repo.name}`;
  const nameB = `${resB.repo.owner}/${resB.repo.name}`;
  let verdict: string;
  if (winsA === winsB) {
    verdict = `🤝 Dead heat — ${winsA} categories each, overall ${resA.scores.overall}% vs ${resB.scores.overall}%`;
  } else {
    const winner = winsA > winsB ? nameA : nameB;
    const w = Math.max(winsA, winsB);
    const pts =
      overallWinner === "tie"
        ? "equal overall"
        : `${Math.max(resA.scores.overall, resB.scores.overall)}% vs ${Math.min(resA.scores.overall, resB.scores.overall)}% overall`;
    verdict = `🏆 ${truncate(winner, 40)} wins ${w} of ${CATS.length} categories · ${pts}`;
  }

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="RepoDoctor head-to-head: ${esc(nameA)} vs ${esc(nameB)}">`,
    `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0d1526"/><stop offset="1" stop-color="#080d18"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#34d399"/><stop offset="0.5" stop-color="#38bdf8"/><stop offset="1" stop-color="#fb7185"/>
      </linearGradient>
    </defs>`,
    `<clipPath id="round"><rect width="${W}" height="${H}" rx="18"/></clipPath>`,
    `<g clip-path="url(#round)">`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>`,
    `<rect width="${W}" height="4" fill="url(#accent)"/>`
  );

  // header
  parts.push(
    `<text x="44" y="52" font-family="${FONT}" font-size="19" font-weight="700" fill="#34d399">🩺 RepoDoctor</text>`,
    `<text x="200" y="52" font-family="${FONT}" font-size="14" fill="${MUTED}">Head-to-Head</text>`,
    `<text x="${W - 44}" y="52" text-anchor="end" font-family="${FONT}" font-size="12" fill="${MUTED}">${new Date(resA.analyzedAt).toISOString().slice(0, 10)}</text>`,
    `<text x="44" y="76" font-family="${FONT}" font-size="12" fill="${MUTED}">Repository health duel — explainable scores, secret &amp; CVE detection, architecture graph</text>`
  );

  // contenders
  const cy = 132;
  const gradeA = resA.scores.grade;
  const gradeB = resB.scores.grade;
  parts.push(
    `<text x="44" y="${cy - 34}" font-family="${FONT}" font-size="17" font-weight="700" fill="#e2e8f0">${esc(truncate(nameA, 28))}</text>`,
    `<text x="${W - 44}" y="${cy - 34}" text-anchor="end" font-family="${FONT}" font-size="17" font-weight="700" fill="#e2e8f0">${esc(truncate(nameB, 28))}</text>`,
    `<text x="44" y="${cy + 30}" font-family="${FONT}" font-size="46" font-weight="800" fill="${gradeColor(gradeA)}">${resA.scores.overall}<tspan font-size="20" fill="${MUTED}">%</tspan></text>`,
    `<text x="${W - 44}" y="${cy + 30}" text-anchor="end" font-family="${FONT}" font-size="46" font-weight="800" fill="${gradeColor(gradeB)}">${resB.scores.overall}<tspan font-size="20" fill="${MUTED}">%</tspan></text>`,
    `<text x="44" y="${cy + 52}" font-family="${FONT}" font-size="13" font-weight="600" fill="${gradeColor(gradeA)}">grade ${esc(gradeA)}</text>`,
    `<text x="${W - 44}" y="${cy + 52}" text-anchor="end" font-family="${FONT}" font-size="13" font-weight="600" fill="${gradeColor(gradeB)}">grade ${esc(gradeB)}</text>`,
    `<text x="${W / 2}" y="${cy + 8}" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="800" fill="#334155">VS</text>`,
    `<line x1="44" y1="${cy + 70}" x2="${W - 44}" y2="${cy + 70}" stroke="${CARD_LINE}" stroke-width="1"/>`
  );

  // category rows
  const rowY0 = cy + 104;
  const rowH = 44;
  CATS.forEach((k, i) => {
    const y = rowY0 + i * rowH;
    const ca = catA(k);
    const cb = catB(k);
    const aWins = ca.score > cb.score;
    const bWins = cb.score > ca.score;
    const barMax = 250;
    const wA = Math.max(6, Math.round((ca.score / 100) * barMax));
    const wB = Math.max(6, Math.round((cb.score / 100) * barMax));
    const diff = ca.score - cb.score;
    const diffLabel =
      diff === 0 ? "tie" : diff > 0 ? `A +${diff}` : `B +${-diff}`;
    const diffColor = diff === 0 ? MUTED : diff > 0 ? "#34d399" : "#38bdf8";

    // A bar grows right-to-left from x=350 toward x=100
    parts.push(
      `<rect x="${350 - barMax}" y="${y - 9}" width="${barMax}" height="14" rx="7" fill="#141e33"/>`,
      `<rect x="${350 - wA}" y="${y - 9}" width="${wA}" height="14" rx="7" fill="${aWins ? WIN : LOSE}"/>`,
      `<text x="${350 - wA - 10}" y="${y + 3}" text-anchor="end" font-family="${FONT}" font-size="15" font-weight="${aWins ? 700 : 500}" fill="${aWins ? WIN : "#8b9ab5"}">${ca.score}</text>`,
      // center label
      `<circle cx="${W / 2 - textHalf(CATEGORY_LABELS[k])}" cy="${y - 3}" r="3" fill="${CAT_DOT[k]}"/>`,
      `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="600" fill="#cbd5e1">${esc(CATEGORY_LABELS[k])}</text>`,
      `<text x="${W / 2}" y="${y + 15}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${diffColor}">${diffLabel}</text>`,
      // B bar grows left-to-right from x=510
      `<rect x="510" y="${y - 9}" width="${barMax}" height="14" rx="7" fill="#141e33"/>`,
      `<rect x="510" y="${y - 9}" width="${wB}" height="14" rx="7" fill="${bWins ? WIN : LOSE}"/>`,
      `<text x="${510 + wB + 10}" y="${y + 3}" font-family="${FONT}" font-size="15" font-weight="${bWins ? 700 : 500}" fill="${bWins ? WIN : "#8b9ab5"}">${cb.score}</text>`
    );
  });

  // verdict strip
  const vy = H - 52;
  parts.push(
    `<rect x="44" y="${vy - 26}" width="${W - 88}" height="44" rx="10" fill="#0f2420" stroke="#1d3a30"/>`,
    `<text x="${W / 2}" y="${vy + 2}" text-anchor="middle" font-family="${FONT}" font-size="14" font-weight="600" fill="#a7f3d0">${esc(verdict)}</text>`
  );

  parts.push(`</g></svg>`);

  return new Response(parts.join("\n"), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

function textHalf(label: string): number {
  // half-width estimate of the 13px label so the dot clears the text
  return label.length * 3.6 + 8;
}
