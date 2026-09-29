"use client";

import { useState } from "react";
import { AnalysisResult } from "@/lib/types";

const BAR_COLORS: Record<string, string> = {
  quality: "from-sky-500 to-sky-400",
  security: "from-rose-500 to-rose-400",
  documentation: "from-amber-500 to-amber-400",
  testing: "from-emerald-500 to-emerald-400",
  maintainability: "from-violet-500 to-violet-400",
};

function barColor(score: number): string {
  return score >= 75 ? "bg-emerald-400" : score >= 50 ? "bg-amber-400" : "bg-rose-400";
}

export default function VitalsView({ result }: { result: AnalysisResult }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {result.scores.categories.map((c) => {
        const expanded = open === c.key;
        return (
          <div key={c.key} className="card overflow-hidden">
            <button
              className="w-full px-5 py-4 flex items-center gap-4 text-left"
              onClick={() => setOpen(expanded ? null : c.key)}
            >
              <span className={`w-14 text-2xl font-bold font-mono ${barColor(c.score).replace("bg-", "text-")}`}>
                {c.score}
              </span>
              <div className="flex-1">
                <div className="flex justify-between mb-1.5">
                  <span className="font-medium text-sm">{c.label}</span>
                  <span className="text-xs text-slate-500">-{c.penalty} pts in penalties</span>
                </div>
                <div className="h-2 rounded-full bg-ink-700 overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${BAR_COLORS[c.key]} transition-all duration-700`}
                    style={{ width: `${c.score}%` }}
                  />
                </div>
              </div>
              <span className={`text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
            </button>
            {expanded && (
              <div className="px-5 pb-4 border-t border-ink-700 pt-3">
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Why this score</p>
                {c.contributions.length === 0 && (
                  <p className="text-sm text-emerald-400">No penalties — nothing flagged in this category.</p>
                )}
                <ul className="space-y-1.5">
                  {c.contributions.map((k, i) => (
                    <li key={i} className="flex justify-between text-sm gap-4">
                      <span className="text-slate-300">{k.title}</span>
                      <span className="font-mono text-rose-400 shrink-0">−{k.penalty}</span>
                    </li>
                  ))}
                </ul>
                {c.note && <p className="text-xs text-slate-500 mt-3 italic">{c.note}</p>}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-slate-500 px-1">
        Overall = weighted mean (quality 25% · security 25% · testing 20% · documentation 15% ·
        maintainability 15%). Critical findings cap their category score.
      </p>
    </div>
  );
}
