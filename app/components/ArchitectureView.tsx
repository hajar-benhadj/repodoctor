"use client";

import { useMemo, useState } from "react";
import { AnalysisResult, ArchitectureGraph, GraphNode } from "@/lib/types";

const W = 860;
const H = 560;

interface Pos {
  id: string;
  x: number;
  y: number;
}

// Small deterministic force simulation — no external deps.
function forceLayout(nodes: GraphNode[], edges: { source: string; target: string; weight: number }[]): Pos[] {
  const n = nodes.length;
  if (n === 0) return [];
  const pos: Pos[] = nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    const spread = Math.min(W, H) / 4;
    return {
      id: node.id,
      x: W / 2 + Math.cos(angle) * spread,
      y: H / 2 + Math.sin(angle) * spread,
    };
  });
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const byId = new Map(pos.map((p) => [p.id, p]));
  for (let iter = 0; iter < 260; iter++) {
    const cooling = 1 - iter / 260;
    // repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos[i];
        const b = pos[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = (i - j) * 0.7 + 0.3;
          dy = (j - i) * 0.7 + 0.3;
          d2 = dx * dx + dy * dy;
        }
        const f = 14000 / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.x -= fx * cooling;
        a.y -= fy * cooling;
        b.x += fx * cooling;
        b.y += fy * cooling;
      }
    }
    // springs
    for (const e of edges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const target = 110;
      const f = (d - target) * 0.015 * Math.min(2, e.weight);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.x += fx * cooling;
      a.y += fy * cooling;
      b.x -= fx * cooling;
      b.y -= fy * cooling;
    }
    // gravity + bounds
    for (const p of pos) {
      p.x += (W / 2 - p.x) * 0.025 * cooling;
      p.y += (H / 2 - p.y) * 0.025 * cooling;
      p.x = Math.max(70, Math.min(W - 70, p.x));
      p.y = Math.max(50, Math.min(H - 50, p.y));
    }
  }
  return pos;
}

function GraphSVG({ graph }: { graph: ArchitectureGraph }) {
  const positions = useMemo(() => forceLayout(graph.nodes, graph.edges), [graph]);
  const byId = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const cycleIds = useMemo(() => new Set(graph.cycles.flat()), [graph]);
  const maxLoc = Math.max(1, ...graph.nodes.map((n) => n.loc));

  const radius = (n: GraphNode) => 12 + Math.sqrt((n.loc / maxLoc) * 26);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-ink-900 border border-ink-700">
      {graph.edges.map((e, i) => {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) return null;
        const cycleEdge = cycleIds.has(e.source) && cycleIds.has(e.target);
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={cycleEdge ? "#fb7185" : "#2a3a5c"}
            strokeWidth={Math.min(4, 0.8 + e.weight * 0.35)}
            strokeOpacity={cycleEdge ? 0.9 : 0.7}
          />
        );
      })}
      {graph.nodes.map((n) => {
        const p = byId.get(n.id)!;
        const r = radius(n);
        const inCycle = cycleIds.has(n.id);
        return (
          <g key={n.id}>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={inCycle ? "rgba(251,113,133,0.25)" : "rgba(52,211,153,0.18)"}
              stroke={inCycle ? "#fb7185" : "#34d399"}
              strokeWidth={1.5}
            >
              <title>{`${n.id}\nLOC: ${n.loc} · max cx: ${n.complexity}\nfan-in: ${n.fanIn} · fan-out: ${n.fanOut}${inCycle ? "\n⚠ part of an import cycle" : ""}`}</title>
            </circle>
            <text x={p.x} y={p.y + r + 11} textAnchor="middle" fontSize="9.5" fill={inCycle ? "#fb7185" : "#94a3b8"}>
              {n.label.length > 22 ? n.label.slice(0, 20) + "…" : n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ArchitectureView({ result }: { result: AnalysisResult }) {
  const [level, setLevel] = useState<"module" | "file">("module");
  const graph = level === "module" ? result.architecture : result.fileGraph ?? result.architecture;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {result.fileGraph && (
          <div className="flex gap-1 chip !p-0.5">
            {(["module", "file"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`px-2.5 py-1 rounded-full text-xs capitalize ${
                  level === l ? "bg-emerald-500 text-ink-950 font-semibold" : "text-slate-400"
                }`}
              >
                {l} level
              </button>
            ))}
          </div>
        )}
        <span className="chip">{graph.nodes.length} nodes</span>
        <span className="chip">{graph.edges.length} edges</span>
        {graph.cycles.length > 0 && (
          <span className="chip border-rose-500/40 text-rose-300">{graph.cycles.length} cycles</span>
        )}
      </div>

      {graph.nodes.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          No import relationships detected for this language set.
        </div>
      ) : (
        <GraphSVG graph={graph} />
      )}

      {graph.cycles.length > 0 && (
        <div className="card p-4 border-rose-500/30">
          <h4 className="font-semibold text-rose-300 mb-2">⚠ Circular dependencies</h4>
          <ul className="text-sm text-slate-300 space-y-1 font-mono">
            {graph.cycles.slice(0, 4).map((c, i) => (
              <li key={i}>{c.join(" → ")} → {c[0]}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h4 className="font-semibold text-sm mb-2">Most depended-upon modules</h4>
          <div className="flex flex-wrap gap-2">
            {graph.topFanIn.map((t) => (
              <span key={t.id} className="chip">
                {t.id} <span className="text-emerald-400">fan-in {t.fanIn}</span>
              </span>
            ))}
            {graph.topFanIn.length === 0 && <span className="text-sm text-slate-500">—</span>}
          </div>
        </div>
        <div className="card p-4">
          <h4 className="font-semibold text-sm mb-2">Top external dependencies</h4>
          <div className="flex flex-wrap gap-2">
            {graph.externalDeps.map((d) => (
              <span key={d.name} className="chip">
                {d.name} <span className="text-slate-500">×{d.count}</span>
              </span>
            ))}
            {graph.externalDeps.length === 0 && <span className="text-sm text-slate-500">—</span>}
          </div>
        </div>
      </div>

      {result.vulnerableDeps.length > 0 && (
        <div className="card p-4 border-rose-500/30">
          <h4 className="font-semibold text-rose-300 text-sm mb-2">
            Vulnerable dependencies ({result.vulnerableDeps.length})
          </h4>
          <div className="space-y-1.5 text-sm">
            {result.vulnerableDeps.slice(0, 10).map((d) => (
              <div key={`${d.ecosystem}:${d.name}`} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{d.name}@{d.version}</span>
                <span className="text-slate-500 text-xs">({d.ecosystem})</span>
                {d.vulns.map((v) => (
                  <a
                    key={v.id}
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-rose-300 hover:underline"
                  >
                    {v.id}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 px-1">
        Node size ∝ lines of code · red nodes participate in import cycles · hover a node for details.
        {graph.unresolvedImports > 0 && ` ${graph.unresolvedImports} imports unresolved (external or dynamic).`}
      </p>
    </div>
  );
}
