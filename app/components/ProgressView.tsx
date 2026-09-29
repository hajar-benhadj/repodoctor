"use client";

import { Job } from "@/lib/types";

const STAGES = [
  { key: "fetch", label: "Fetch repository", desc: "Metadata + archive download" },
  { key: "parse", label: "Parse & languages", desc: "Walk files, strip comments/strings" },
  { key: "quality", label: "Code quality metrics", desc: "Complexity, duplication, size" },
  { key: "security", label: "Security & dependencies", desc: "Secrets, patterns, OSV.dev CVEs" },
  { key: "graph", label: "Architecture graph", desc: "Imports, modules, cycles" },
  { key: "scoring", label: "Scoring & prescription", desc: "Penalty model, action plan" },
];

export default function ProgressView({ job }: { job: Job }) {
  const stageIdx = STAGES.findIndex((s) => s.key === job.stage);
  const current = stageIdx === -1 ? 0 : stageIdx;

  return (
    <main className="max-w-2xl mx-auto px-6 py-20">
      <div className="text-center mb-10">
        <div className="text-4xl mb-3 animate-pulse-slow">🩺</div>
        <h1 className="text-2xl font-bold">
          Analyzing <span className="text-emerald-400">{job.owner}/{job.repo}</span>
        </h1>
        <p className="text-slate-500 text-sm mt-2">Usually 15–90 seconds depending on repository size.</p>
      </div>

      <div className="card p-6 mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-400">{job.message}</span>
          <span className="font-mono text-emerald-400">{job.progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-ink-700 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      <ol className="space-y-2">
        {STAGES.map((s, i) => {
          const done = i < current || job.status === "done";
          const active = i === current && job.status !== "done";
          return (
            <li
              key={s.key}
              className={`card px-4 py-3 flex items-center gap-3 transition-opacity ${
                done ? "opacity-60" : active ? "border-emerald-500/50" : "opacity-40"
              }`}
            >
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  done
                    ? "bg-emerald-500/20 text-emerald-400"
                    : active
                    ? "bg-emerald-500 text-ink-950 animate-pulse"
                    : "bg-ink-700 text-slate-500"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <div>
                <div className="font-medium text-sm">{s.label}</div>
                <div className="text-xs text-slate-500">{s.desc}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
