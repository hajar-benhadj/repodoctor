"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnalysisResult, CATEGORY_LABELS, Category, Finding, Job, Severity } from "@/lib/types";
import GradeDonut from "./GradeDonut";

const PRESETS: [string, string, string][] = [
  ["express vs fastify", "https://github.com/expressjs/express", "https://github.com/fastify/fastify"],
  ["flask vs starlette", "https://github.com/pallets/flask", "https://github.com/encode/starlette"],
  ["commander vs yargs", "https://github.com/tj/commander.js", "https://github.com/yargs/yargs"],
];

const CAT_ORDER: Category[] = ["quality", "security", "testing", "documentation", "maintainability"];
const SEV_ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2, info: 3 };

function fmt(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

function MiniPatient({ result, side }: { result: AnalysisResult; side: "a" | "b" }) {
  const { repo, meta, scores, stats } = result;
  const win = side === "a" ? "border-emerald-500/60" : "border-sky-500/60";
  return (
    <div className={`card p-5 flex-1 min-w-0 ${win}`}>
      <a
        href={repo.url}
        target="_blank"
        rel="noreferrer"
        className="font-bold text-lg hover:text-emerald-400 transition-colors"
      >
        {repo.owner}/<span className="text-emerald-400">{repo.name}</span>
      </a>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="chip text-[10px]">⭐ {fmt(meta.stars)}</span>
        <span className="chip text-[10px]">{meta.primaryLanguage ?? "—"}</span>
        <span className="chip text-[10px]">📄 {fmt(stats.totalLoc)} LOC</span>
        <span className="chip text-[10px]">👤 {meta.contributors}</span>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <div className="scale-90 origin-left">
          <GradeDonut score={scores.overall} grade={scores.grade} />
        </div>
        <div className="text-sm text-slate-400">
          <div className="font-mono text-2xl text-slate-200">{scores.overall}%</div>
          <div>{stats.filesAnalyzed} files · {(stats.durationMs / 1000).toFixed(1)}s</div>
        </div>
      </div>
    </div>
  );
}

export default function CompareClient({ aId, bId }: { aId: string; bId: string }) {
  const router = useRouter();
  const [ua, setUa] = useState("");
  const [ub, setUb] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobA, setJobA] = useState<Job | null>(null);
  const [jobB, setJobB] = useState<Job | null>(null);
  const [resA, setResA] = useState<AnalysisResult | null>(null);
  const [resB, setResB] = useState<AnalysisResult | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // start a comparison
  async function start(va: string, vb: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a: va, b: vb }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }
      router.push(`/compare?a=${data.a.id}&b=${data.b.id}`);
    } catch {
      setError("Could not reach the server.");
      setSubmitting(false);
    }
  }

  const hasIds = !!aId && !!bId;

  // poll both jobs until terminal
  useEffect(() => {
    if (!hasIds) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const fetchJob = async (id: string) => {
        const res = await fetch(`/api/analyze/${id}`);
        if (!res.ok) return { job: null, result: null, missing: true };
        const data = await res.json();
        return { job: data.job as Job, result: (data.result ?? null) as AnalysisResult | null, missing: false };
      };
      const [ra, rb] = await Promise.all([fetchJob(aId), fetchJob(bId)]);
      if (cancelled) return;
      if (ra.missing || rb.missing) {
        setError("One of the two diagnoses does not exist (or the server was restarted).");
        return;
      }
      setJobA(ra.job);
      setJobB(rb.job);
      if (ra.result) setResA(ra.result);
      if (rb.result) setResB(rb.result);
      const doneA = ra.job?.status === "done" || ra.job?.status === "error";
      const doneB = rb.job?.status === "done" || rb.job?.status === "error";
      if (doneA && doneB) return;
      timer = setTimeout(poll, 2500);
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [aId, bId, hasIds]);

  const analysis = useMemo(() => {
    if (!resA || !resB) return null;
    const wins = { a: 0, b: 0, tie: 0 };
    const rows = CAT_ORDER.map((key) => {
      const ca = resA.scores.categories.find((c) => c.key === key)!;
      const cb = resB.scores.categories.find((c) => c.key === key)!;
      if (ca.score > cb.score) wins.a++;
      else if (cb.score > ca.score) wins.b++;
      else wins.tie++;
      return { key, ca, cb, diff: ca.score - cb.score };
    });
    const onlyA = resA.findings.filter((f) => !resB.findings.some((g) => g.id === f.id));
    const onlyB = resB.findings.filter((f) => !resA.findings.some((g) => g.id === f.id));
    const shared = resA.findings.filter((f) => resB.findings.some((g) => g.id === f.id));
    return { rows, wins, onlyA, onlyB, shared };
  }, [resA, resB]);

  const pending = hasIds && (!resA || !resB);
  const cardUrl =
    resA && resB ? `${origin}/api/card?a=${resA.id}&b=${resB.id}` : `/api/card?a=${aId}&b=${bId}`;
  const cardMarkdown = origin
    ? `[![RepoDoctor Head-to-Head](${cardUrl})](${origin}/compare?a=${aId}&b=${bId})`
    : "";

  async function copyCard() {
    try {
      await navigator.clipboard.writeText(cardMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <header className="flex items-center justify-between mb-10">
        <a href="/" className="flex items-center gap-2 text-xl font-bold">
          <span className="text-2xl">🩺</span>
          <span>
            Repo<span className="text-emerald-400">Doctor</span>
          </span>
        </a>
        <a href="/" className="chip hover:border-emerald-500/50">← New diagnosis</a>
      </header>

      <h1 className="text-3xl font-black text-center mb-8">
        Head-to-Head <span className="text-emerald-400">🥊</span>
      </h1>

      {/* inputs */}
      <div className="card p-5 mb-8 no-print">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(ua, ub);
          }}
          className="grid md:grid-cols-[1fr_auto_1fr_auto] gap-3 items-center"
        >
          <input
            className="input-main"
            placeholder="github.com/owner/repo — contender A"
            value={ua}
            onChange={(e) => setUa(e.target.value)}
            spellCheck={false}
          />
          <span className="text-center font-black text-xl text-slate-500">VS</span>
          <input
            className="input-main"
            placeholder="github.com/owner/repo — contender B"
            value={ub}
            onChange={(e) => setUb(e.target.value)}
            spellCheck={false}
          />
          <button className="btn-primary" disabled={submitting}>
            {submitting ? "Starting…" : "Compare"}
          </button>
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
          {PRESETS.map(([label, a, b]) => (
            <button
              key={label}
              onClick={() => start(a, b)}
              disabled={submitting}
              className="chip hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        {error && <p className="text-rose-400 text-sm mt-3">{error}</p>}
      </div>

      {!hasIds && (
        <p className="text-center text-slate-500 text-sm">
          Pick two public repositories and RepoDoctor will crown a winner per category —
          reuse of cached analyses makes rematches instant.
        </p>
      )}

      {pending && jobA && jobB && (
        <div className="card p-6 text-center">
          <p className="font-semibold mb-1">
            Preparing {jobA.owner}/{jobA.repo} vs {jobB.owner}/{jobB.repo}…
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm text-slate-400 mt-4">
            <div>
              <div className="flex justify-between mb-1">
                <span>A · {jobA.owner}/{jobA.repo}</span>
                <span className="font-mono">{jobA.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-ink-700 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${jobA.progress}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span>B · {jobB.owner}/{jobB.repo}</span>
                <span className="font-mono">{jobB.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-ink-700 overflow-hidden">
                <div className="h-full bg-sky-500 transition-all" style={{ width: `${jobB.progress}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {pending && (!jobA || !jobB) && (
        <div className="card p-6 text-center text-slate-500 animate-pulse">Loading comparison…</div>
      )}

      {(jobA?.status === "error" || jobB?.status === "error") && (
        <div className="card p-6 border-rose-500/40 text-rose-300">
          A side failed: {jobA?.status === "error" ? `${jobA.owner}/${jobA.repo} — ${jobA.error}` : ""}
          {jobB?.status === "error" ? `${jobB.owner}/${jobB.repo} — ${jobB.error}` : ""}
        </div>
      )}

      {resA && resB && analysis && (
        <div className="space-y-8">
          {/* contenders */}
          <div className="flex flex-col md:flex-row gap-4 items-stretch">
            <MiniPatient result={resA} side="a" />
            <MiniPatient result={resB} side="b" />
          </div>

          {/* verdict */}
          <div className="card p-6 text-center border-emerald-500/40 shadow-glow">
            {analysis.wins.a !== analysis.wins.b ? (
              <p className="text-lg">
                🏆{" "}
                <span className="font-bold text-emerald-400">
                  {analysis.wins.a > analysis.wins.b
                    ? `${resA.repo.owner}/${resA.repo.name}`
                    : `${resB.repo.owner}/${resB.repo.name}`}
                </span>{" "}
                takes it —{" "}
                <span className="font-mono">
                  {Math.max(analysis.wins.a, analysis.wins.b)} of {CAT_ORDER.length}
                </span>{" "}
                categories · overall {Math.max(resA.scores.overall, resB.scores.overall)}% vs{" "}
                {Math.min(resA.scores.overall, resB.scores.overall)}%
              </p>
            ) : (
              <p className="text-lg">🤝 Dead heat — {analysis.wins.tie} categories tied, overall within 0 pts</p>
            )}
          </div>

          {/* mirrored bars */}
          <div className="card p-6">
            <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-5">Category duel</h2>
            <div className="space-y-4">
              {analysis.rows.map(({ key, ca, cb, diff }) => {
                const aWins = diff > 0;
                const bWins = diff < 0;
                return (
                  <div key={key} className="grid grid-cols-[1fr_150px_1fr] items-center gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-3 rounded-full bg-ink-700 overflow-hidden flex justify-end">
                        <div
                          className={`h-full ${aWins ? "bg-emerald-400" : "bg-slate-500"}`}
                          style={{ width: `${ca.score}%` }}
                        />
                      </div>
                      <span className={`font-mono text-lg w-10 text-right ${aWins ? "text-emerald-400 font-bold" : "text-slate-300"}`}>
                        {ca.score}
                      </span>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium">{CATEGORY_LABELS[key]}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {diff === 0 ? "tie" : `${aWins ? "A" : "B"} +${Math.abs(diff)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-lg w-10 ${bWins ? "text-emerald-400 font-bold" : "text-slate-300"}`}>
                        {cb.score}
                      </span>
                      <div className="flex-1 h-3 rounded-full bg-ink-700 overflow-hidden">
                        <div
                          className={`h-full ${bWins ? "bg-emerald-400" : "bg-slate-500"}`}
                          style={{ width: `${cb.score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-4 text-xs text-slate-500">
              <span>
                A = {resA.repo.owner}/{resA.repo.name}
              </span>
              <span>
                B = {resB.repo.owner}/{resB.repo.name}
              </span>
            </div>
          </div>

          {/* findings diff */}
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { title: `Only in ${resA.repo.name}`, findings: analysis.onlyA, result: resA },
              { title: `Only in ${resB.repo.name}`, findings: analysis.onlyB, result: resB },
            ].map(({ title, findings, result }) => (
              <div key={title} className="card p-5">
                <h3 className="font-semibold text-sm mb-3">{title} ({findings.length})</h3>
                {findings.length === 0 && <p className="text-sm text-slate-500">Nothing unique — sides match.</p>}
                <ul className="space-y-2">
                  {[...findings]
                    .sort((x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity])
                    .slice(0, 8)
                    .map((f: Finding) => (
                      <li key={f.id} className="text-sm">
                        <span
                          className={`inline-block w-2 h-2 rounded-full mr-2 ${
                            f.severity === "critical"
                              ? "bg-rose-500"
                              : f.severity === "major"
                              ? "bg-amber-500"
                              : f.severity === "minor"
                              ? "bg-sky-400"
                              : "bg-slate-400"
                          }`}
                        />
                        {f.title}
                        {f.file && (
                          <a
                            href={`https://github.com/${result.repo.owner}/${result.repo.name}/blob/${result.repo.ref}/${f.file}${f.line ? `#L${f.line}` : ""}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-[11px] font-mono text-sky-400 hover:underline ml-4"
                          >
                            {f.file}{f.line ? `:${f.line}` : ""} ↗
                          </a>
                        )}
                      </li>
                    ))}
                  {findings.length > 8 && (
                    <li className="text-xs text-slate-500">+{findings.length - 8} more on the full report</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
          {analysis.shared.length > 0 && (
            <p className="text-xs text-slate-500 px-1">
              Shared findings on both sides: {analysis.shared.map((f) => f.title).join(" · ")}
            </p>
          )}

          {/* shareable duel card */}
          <div className="card p-5 no-print">
            <h4 className="font-semibold text-sm mb-3">Shareable duel card</h4>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cardUrl}
              alt={`${resA.repo.name} vs ${resB.repo.name} — RepoDoctor head-to-head card`}
              className="w-full max-w-[620px] rounded-xl border border-ink-700"
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={copyCard}
                className="chip hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
              >
                {copied ? "✓ Copied!" : "⧉ Copy card (Markdown)"}
              </button>
              <a href={cardUrl} target="_blank" rel="noreferrer" className="chip hover:border-emerald-500/50">
                Open SVG ↗
              </a>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Paste it in a README or a post — the card regenerates from the stored analysis, so
              the duel stays frozen at the moment it was run.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
