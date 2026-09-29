"use client";

import { useMemo, useState } from "react";
import { AnalysisResult, CATEGORY_LABELS, Category, Finding, Severity } from "@/lib/types";

const SEV_STYLE: Record<Severity, { dot: string; pill: string }> = {
  critical: { dot: "bg-rose-500", pill: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  major: { dot: "bg-amber-500", pill: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  minor: { dot: "bg-sky-400", pill: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  info: { dot: "bg-slate-400", pill: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

const SEVERITIES: (Severity | "all")[] = ["all", "critical", "major", "minor", "info"];

export default function FindingsView({ result }: { result: AnalysisResult }) {
  const [sev, setSev] = useState<Severity | "all">("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: result.findings.length, critical: 0, major: 0, minor: 0, info: 0 };
    for (const f of result.findings) c[f.severity]++;
    return c;
  }, [result]);

  const filtered = result.findings
    .filter((f) => sev === "all" || f.severity === sev)
    .sort((a, b) => {
      const order = { critical: 0, major: 1, minor: 2, info: 3 };
      return order[a.severity] - order[b.severity];
    });

  const grouped = filtered.reduce<Record<string, Finding[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5 no-print">
        {SEVERITIES.map((s) => (
          <button
            key={s}
            onClick={() => setSev(s)}
            className={`chip capitalize ${sev === s ? "border-emerald-500/60 text-emerald-300" : ""}`}
          >
            {s} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card p-8 text-center text-emerald-400">
          {sev === "all" ? "No findings at all — suspiciously clean." : `No ${sev} findings.`}
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">
              {CATEGORY_LABELS[cat as Category]}
            </h3>
            <div className="space-y-2">
              {items.map((f) => (
                <div key={f.id + (f.file ?? "")} className="card p-4">
                  <div className="flex items-start gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${SEV_STYLE[f.severity].dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{f.title}</span>
                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${SEV_STYLE[f.severity].pill}`}>
                          {f.severity}
                        </span>
                        {f.metric && <span className="chip text-[10px]">{f.metric}</span>}
                        <span className="text-[10px] text-slate-500 font-mono">−{f.penalty} pts</span>
                      </div>
                      <p className="text-sm text-slate-400 whitespace-pre-line">{f.detail}</p>
                      {f.file && (
                        <a
                          href={`https://github.com/${result.repo.owner}/${result.repo.name}/blob/${result.repo.ref}/${f.file}${f.line ? `#L${f.line}` : ""}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block mt-2 text-xs font-mono text-sky-400 hover:underline"
                        >
                          {f.file}{f.line ? `:${f.line}` : ""} ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
