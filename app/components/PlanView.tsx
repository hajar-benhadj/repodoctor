"use client";

import { useState } from "react";
import { AnalysisResult } from "@/lib/types";

const IMPACT_STYLE = {
  high: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  low: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const EFFORT_STYLE = {
  low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  high: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export default function PlanView({ result }: { result: AnalysisResult }) {
  const [ai, setAi] = useState<{ text: string; provider: string } | null>(
    result.prescription ? { text: result.prescription.text, provider: result.prescription.provider } : null
  );
  const [aiState, setAiState] = useState<"idle" | "loading" | "unavailable">("idle");
  const [aiMessage, setAiMessage] = useState<string>("");

  async function generate() {
    setAiState("loading");
    try {
      const res = await fetch(`/api/analyze/${result.id}/prescribe`, { method: "POST" });
      const data = await res.json();
      if (data.available) {
        setAi({ text: data.text, provider: data.provider });
        setAiState("idle");
      } else {
        setAiMessage(data.message ?? "LLM not available.");
        setAiState("unavailable");
      }
    } catch {
      setAiMessage("Could not reach the prescription endpoint.");
      setAiState("unavailable");
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {result.plan.map((p) => (
          <div key={p.rank} className="card p-5 flex gap-4">
            <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold flex items-center justify-center shrink-0">
              {p.rank}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h4 className="font-semibold">{p.title}</h4>
                <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${IMPACT_STYLE[p.impact]}`}>
                  {p.impact} impact
                </span>
                <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${EFFORT_STYLE[p.effort]}`}>
                  {p.effort} effort
                </span>
              </div>
              <p className="text-sm text-slate-400">{p.detail}</p>
            </div>
          </div>
        ))}
        {result.plan.length === 0 && (
          <div className="card p-8 text-center text-emerald-400">
            Clean bill of health — nothing to prescribe.
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h4 className="font-semibold">🤖 AI-written prescription</h4>
            <p className="text-xs text-slate-500">
              Optional LLM narrative on top of the deterministic findings. The plan above works without it.
            </p>
          </div>
          {!ai && (
            <button onClick={generate} className="btn-primary text-sm shrink-0" disabled={aiState === "loading"}>
              {aiState === "loading" ? "Consulting…" : "Generate"}
            </button>
          )}
        </div>
        {ai && (
          <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed border-t border-ink-700 pt-3">
            {ai.text}
            <div className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest">via {ai.provider}</div>
          </div>
        )}
        {aiState === "unavailable" && (
          <p className="text-sm text-amber-300/90 border-t border-ink-700 pt-3">{aiMessage}</p>
        )}
      </div>
    </div>
  );
}
