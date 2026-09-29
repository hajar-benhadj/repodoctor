"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Recent {
  id: string;
  owner: string;
  repo: string;
  overall: number;
  grade: string;
}

const DEMOS = ["tj/commander.js", "expressjs/express", "pallets/flask", "honojs/hono"];

const CATEGORY_CHIPS = [
  { label: "Code Quality", color: "bg-sky-500" },
  { label: "Security", color: "bg-rose-500" },
  { label: "Documentation", color: "bg-amber-500" },
  { label: "Testing", color: "bg-emerald-500" },
  { label: "Maintainability", color: "bg-violet-500" },
];

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);

  useEffect(() => {
    fetch("/api/analyses")
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((d) => setRecent(d.results ?? []))
      .catch(() => {});
  }, []);

  async function submit(target?: string) {
    const value = (target ?? url).trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setLoading(false);
        return;
      }
      router.push(`/analysis/${data.job.id}`);
    } catch {
      setError("Could not reach the server.");
      setLoading(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-16">
      <header className="flex items-center justify-between mb-16">
        <div className="flex items-center gap-2 text-xl font-bold">
          <span className="text-2xl">🩺</span>
          <span>
            Repo<span className="text-emerald-400">Doctor</span>
          </span>
        </div>
        <a
          className="chip hover:border-emerald-500/50"
          href="/compare"
        >
          🥊 Head-to-head
        </a>
        <a
          className="chip hover:border-emerald-500/50"
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
        >
          Public repos only
        </a>
      </header>

      <section className="text-center mb-14">
        <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-5">
          Your repository,
          <br />
          <span className="text-emerald-400">diagnosed.</span>
        </h1>
        <p className="text-slate-400 max-w-2xl mx-auto mb-10 text-lg">
          Paste any public GitHub repository. RepoDoctor clones it, runs static analysis, and
          returns explainable health scores, secret &amp; CVE detection, an architecture graph and a
          prioritized prescription.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto mb-3"
        >
          <input
            className="input-main flex-1"
            placeholder="github.com/owner/repository"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
            autoFocus
          />
          <button className="btn-primary shadow-glow" disabled={loading}>
            {loading ? "Starting…" : "Run diagnosis"}
          </button>
        </form>
        {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}

        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {DEMOS.map((d) => (
            <button
              key={d}
              onClick={() => submit(`https://github.com/${d}`)}
              disabled={loading}
              className="chip hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
            >
              {d}
            </button>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="mb-12">
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">Recent diagnoses</p>
            <div className="flex flex-wrap justify-center gap-2">
              {recent.map((r) => (
                <a key={r.id} href={`/analysis/${r.id}`} className="chip hover:border-emerald-500/50">
                  <span className="font-semibold">{r.owner}/{r.repo}</span>
                  <span className="text-slate-500">•</span>
                  <span className={r.overall >= 75 ? "text-emerald-400" : r.overall >= 50 ? "text-amber-400" : "text-rose-400"}>
                    {r.grade} {r.overall}%
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="grid md:grid-cols-3 gap-4 mb-10">
        <div className="card p-5">
          <h3 className="font-semibold mb-2 text-emerald-400">Explainable scores</h3>
          <p className="text-sm text-slate-400">
            Every score comes with the exact penalties behind it — no black box. Five vitals:
            quality, security, documentation, testing, maintainability.
          </p>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold mb-2 text-rose-400">Real security signals</h3>
          <p className="text-sm text-slate-400">
            Secret detection with entropy filtering, dangerous patterns, and dependency
            vulnerabilities from OSV.dev against your exact locked versions.
          </p>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold mb-2 text-sky-400">Architecture graph</h3>
          <p className="text-sm text-slate-400">
            Import graph aggregated by module, circular dependencies highlighted, complexity
            hotspots sized by lines of code.
          </p>
        </div>
      </section>

      <section className="card p-6 mb-16 text-center border-emerald-500/30">
        <h3 className="font-bold text-lg mb-1">🥊 Head-to-Head</h3>
        <p className="text-sm text-slate-400 mb-4 max-w-xl mx-auto">
          Put two repositories in the ring — mirrored category bars, a winner per vital, and the
          findings that exist on one side only. Rematches are instant thanks to cached analyses.
        </p>
        <a href="/compare" className="btn-primary">Open Head-to-Head</a>
      </section>

      <section className="flex flex-wrap justify-center gap-2 mb-16">
        {CATEGORY_CHIPS.map((c) => (
          <span key={c.label} className="chip">
            <span className={`w-2 h-2 rounded-full ${c.color}`} />
            {c.label}
          </span>
        ))}
      </section>

      <footer className="text-center text-xs text-slate-600 pb-8">
        RepoDoctor analyzes public repositories. Only derived metrics are stored — never your source code.
      </footer>
    </main>
  );
}
