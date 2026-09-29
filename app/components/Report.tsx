"use client";

import { useEffect, useState } from "react";
import { AnalysisResult } from "@/lib/types";
import GradeDonut from "./GradeDonut";
import VitalsView from "./VitalsView";
import FindingsView from "./FindingsView";
import ArchitectureView from "./ArchitectureView";
import PlanView from "./PlanView";

const TABS = ["Vitals", "Findings", "Architecture", "Prescription"] as const;

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export default function Report({ result, cached }: { result: AnalysisResult; cached?: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Vitals");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const { meta, repo, scores, stats } = result;
  const ageDays = meta.pushedAt ? Math.round((Date.now() - new Date(meta.pushedAt).getTime()) / 86400000) : null;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const badgeUrl = origin ? `${origin}/api/badge/${result.id}` : `/api/badge/${result.id}`;
  const badgeMarkdown = origin
    ? `[![RepoDoctor](${badgeUrl})](${origin}/analysis/${result.id})`
    : "";

  async function copyBadge() {
    try {
      await navigator.clipboard.writeText(badgeMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      {/* Patient card */}
      <div className="card p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="min-w-0">
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-2xl font-bold hover:text-emerald-400 transition-colors"
                >
                  {repo.owner}/<span className="text-emerald-400">{repo.name}</span>
                </a>
                {meta.description && (
                  <p className="text-slate-400 text-sm mt-1 line-clamp-2">{meta.description}</p>
                )}
              </div>
              {cached && <span className="chip shrink-0">⚡ cached</span>}
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <span className="chip">⭐ {fmt(meta.stars)}</span>
              <span className="chip">🍴 {fmt(meta.forks)}</span>
              {meta.primaryLanguage && <span className="chip">{meta.primaryLanguage}</span>}
              {meta.license && <span className="chip">⚖ {meta.license}</span>}
              <span className="chip">👤 {meta.contributors} contributors</span>
              <span className="chip">📄 {fmt(stats.totalLoc)} LOC</span>
              <span className="chip">@{repo.ref}</span>
              {ageDays !== null && <span className="chip">last push {ageDays > 730 ? Math.round(ageDays / 365) + "y" : Math.round(ageDays / 30) + "mo"} ago</span>}
            </div>

            <p className="text-xs text-slate-500 mt-4">
              Diagnosed {new Date(result.analyzedAt).toLocaleString()} in {(stats.durationMs / 1000).toFixed(1)}s ·{" "}
              {scores.confidence.filesAnalyzed}/{scores.confidence.filesTotal} files ·{" "}
              {scores.confidence.languages.join(", ") || "—"}
              {scores.confidence.partial && <span className="text-amber-400"> · partial</span>}
            </p>

            {result.notes.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.notes.map((n, i) => (
                  <p key={i} className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    {n}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="flex lg:flex-col items-center justify-center gap-3 shrink-0">
            <GradeDonut score={scores.overall} grade={scores.grade} />
            <div className="text-center">
              <div className="text-xs uppercase tracking-widest text-slate-500">Diagnosis</div>
              <div className="text-sm text-slate-300 max-w-[220px]">
                {scores.overall >= 85
                  ? "Healthy — keep it up."
                  : scores.overall >= 70
                  ? "Manageable issues — see prescription."
                  : scores.overall >= 50
                  ? "Needs attention in several areas."
                  : "Critical condition — follow the prescription closely."}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-ink-700 overflow-x-auto no-print">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t}
            {t === "Findings" && (
              <span className="ml-2 text-xs bg-ink-700 px-1.5 py-0.5 rounded-full">{result.findings.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "Vitals" && <VitalsView result={result} />}
      {tab === "Findings" && <FindingsView result={result} />}
      {tab === "Architecture" && <ArchitectureView result={result} />}
      {tab === "Prescription" && <PlanView result={result} />}

      {/* Share / export */}
      <div className="card p-5 mt-8 no-print">
        <h4 className="font-semibold text-sm mb-3">Share this diagnosis</h4>
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={badgeUrl} alt="RepoDoctor grade badge" className="h-5" />
          <button
            onClick={copyBadge}
            className="chip hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
          >
            {copied ? "✓ Copied!" : "⧉ Copy README badge (Markdown)"}
          </button>
          <button onClick={() => window.print()} className="chip hover:border-emerald-500/50 hover:text-emerald-300 transition-colors">
            ⬇ Export PDF
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Paste the badge in the repository README, or print the current tab to a PDF (light
          theme applied automatically).
        </p>
      </div>

      <div className="flex gap-3 mt-6 text-xs text-slate-500 no-print">
        <a href="/" className="chip hover:border-emerald-500/50">← New diagnosis</a>
        <a
          href={`/api/analyze/${result.id}`}
          className="chip hover:border-emerald-500/50"
          download={`${result.repo.name}-repodoctor.json`}
        >
          ⬇ Export JSON report
        </a>
      </div>
    </main>
  );
}
