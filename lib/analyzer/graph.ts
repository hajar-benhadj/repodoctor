// Architecture: import graph (JS/TS + Python), module aggregation, cycle detection.

import { ArchitectureGraph, Finding, GraphEdge, GraphNode } from "../types";
import { LoadedFile } from "./context";
import { QualityMetrics } from "./quality";

const JS_EXTS = [
  "", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
  "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs",
];

function moduleOf(path: string): string {
  const parts = path.split("/");
  if (parts.length === 1) return "(root)";
  if (["src", "lib", "app", "packages", "server", "client"].includes(parts[0])) {
    return parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  return parts[0];
}

function collectJsImports(f: LoadedFile): string[] {
  const specs: string[] = [];
  const res = [
    /import\s+(?:[\s\S]{0,200}?from\s+)?["']([^"'\n]+)["']/g,
    /export\s+[\s\S]{0,120}?from\s+["']([^"'\n]+)["']/g,
    /require\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
    /import\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  ];
  for (const re of res) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.raw))) specs.push(m[1]);
  }
  return specs;
}

function collectPyImports(f: LoadedFile): string[] {
  const mods: string[] = [];
  const re = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.,\s]+))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f.raw))) {
    if (m[1]) mods.push(m[1]);
    else if (m[2]) {
      for (const part of m[2].split(",")) {
        const t = part.trim();
        if (t) mods.push(t);
      }
    }
  }
  return mods;
}

// Tarjan SCC — iterative to avoid recursion limits on wide graphs.
function tarjanSCC(nodes: string[], adj: Map<string, string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  for (const start of nodes) {
    if (index.has(start)) continue;
    const work: { node: string; i: number }[] = [{ node: start, i: 0 }];
    while (work.length) {
      const frame = work[work.length - 1];
      const v = frame.node;
      if (frame.i === 0) {
        index.set(v, counter);
        low.set(v, counter);
        counter++;
        stack.push(v);
        onStack.add(v);
      }
      let advanced = false;
      const neighbors = adj.get(v) ?? [];
      while (frame.i < neighbors.length) {
        const w = neighbors[frame.i++];
        if (!index.has(w)) {
          work.push({ node: w, i: 0 });
          advanced = true;
          break;
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v)!, index.get(w)!));
        }
      }
      if (advanced) continue;
      if (low.get(v) === index.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);
        if (scc.length > 1) sccs.push(scc);
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].node;
        low.set(parent, Math.min(low.get(parent)!, low.get(v)!));
      }
    }
  }
  return sccs;
}

export function analyzeArchitecture(
  loaded: LoadedFile[],
  quality: QualityMetrics
): { graph: ArchitectureGraph; fileGraph: ArchitectureGraph | undefined; findings: Finding[] } {
  const codeFiles = loaded.filter((f) => ["js", "python"].includes(f.file.lang?.analysis ?? ""));
  const pathLower = new Map<string, string>(); // lowercase path -> real path
  const pyFiles = new Set<string>();
  const locByFile = new Map<string, number>();
  const cxDegByFile = new Map<string, number>();
  for (const f of codeFiles) {
    pathLower.set(f.file.path.toLowerCase(), f.file.path);
    locByFile.set(f.file.path, f.lines);
    if (f.file.lang?.analysis === "python") pyFiles.add(f.file.path);
  }
  for (const fn of quality.functions) {
    cxDegByFile.set(fn.file, Math.max(cxDegByFile.get(fn.file) ?? 0, fn.complexity));
  }

  // --- raw file-level edges ---
  const rawEdges = new Map<string, number>();
  const externals = new Map<string, number>();
  let unresolved = 0;

  const resolveJs = (spec: string, fromPath: string): string | null => {
    if (!spec.startsWith(".")) return null;
    const dir = fromPath.split("/").slice(0, -1).join("/");
    const joined = spec === "." ? dir : spec.startsWith("./") || spec.startsWith("../")
      ? normalize(dir, spec)
      : normalize(dir, spec);
    if (joined == null) return null;
    for (const e of JS_EXTS) {
      const cand = (joined + e).toLowerCase();
      if (pathLower.has(cand)) return pathLower.get(cand)!;
    }
    return null;
  };

  function normalize(dir: string, spec: string): string | null {
    const parts = (dir ? dir.split("/") : []);
    for (const seg of spec.split("/")) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return parts.join("/");
  }

  const resolvePy = (mod: string): string | null => {
    if (!mod) return null;
    const rel = mod.replace(/\./g, "/");
    for (const prefix of ["", "src/", "lib/"]) {
      const candidates = [`${prefix}${rel}.py`, `${prefix}${rel}/__init__.py`];
      for (const c of candidates) {
        const hit = pathLower.get(c.toLowerCase());
        if (hit) return hit;
      }
    }
    return null;
  };

  for (const f of codeFiles) {
    const specs = f.file.lang?.analysis === "js" ? collectJsImports(f) : collectPyImports(f);
    for (const spec of specs) {
      if (f.file.lang?.analysis === "js" && !spec.startsWith(".")) {
        const name = spec.startsWith("@")
          ? spec.split("/").slice(0, 2).join("/")
          : spec.split("/")[0];
        if (name) externals.set(name, (externals.get(name) ?? 0) + 1);
        continue;
      }
      const target = f.file.lang?.analysis === "js" ? resolveJs(spec, f.file.path) : resolvePy(spec);
      if (target && target !== f.file.path) {
        const key = `${f.file.path}->${target}`;
        rawEdges.set(key, (rawEdges.get(key) ?? 0) + 1);
      } else if (!target) {
        unresolved++;
      }
    }
  }

  const buildNode = (id: string, label: string, kind: "module" | "file", loc: number, cx: number): GraphNode => ({
    id, label, kind, loc, complexity: cx, fanIn: 0, fanOut: 0, inCycle: false,
  });

  // --- module-level graph ---
  const moduleLoc = new Map<string, number>();
  const moduleCx = new Map<string, number>();
  for (const f of codeFiles) {
    const m = moduleOf(f.file.path);
    moduleLoc.set(m, (moduleLoc.get(m) ?? 0) + (locByFile.get(f.file.path) ?? 0));
    moduleCx.set(m, Math.max(moduleCx.get(m) ?? 0, cxDegByFile.get(f.file.path) ?? 0));
  }
  const moduleEdges = new Map<string, number>();
  for (const [key, w] of rawEdges) {
    const [from, to] = key.split("->");
    const fm = moduleOf(from);
    const tm = moduleOf(to);
    if (fm === tm) continue;
    const k = `${fm}->${tm}`;
    moduleEdges.set(k, (moduleEdges.get(k) ?? 0) + w);
  }
  const mNodes = [...moduleLoc.keys()].slice(0, 80).map((id) => buildNode(id, id, "module", moduleLoc.get(id) ?? 0, moduleCx.get(id) ?? 0));
  const mNodeIds = new Set(mNodes.map((n) => n.id));
  const mEdges: GraphEdge[] = [...moduleEdges.entries()]
    .map(([k, weight]) => {
      const [source, target] = k.split("->");
      return { source, target, weight };
    })
    .filter((e) => mNodeIds.has(e.source) && mNodeIds.has(e.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 120);

  const decorate = (nodes: GraphNode[], edges: GraphEdge[]) => {
    const fanIn = new Map<string, number>();
    const fanOut = new Map<string, number>();
    for (const e of edges) {
      fanIn.set(e.target, (fanIn.get(e.target) ?? 0) + e.weight);
      fanOut.set(e.source, (fanOut.get(e.source) ?? 0) + e.weight);
    }
    for (const n of nodes) {
      n.fanIn = fanIn.get(n.id) ?? 0;
      n.fanOut = fanOut.get(n.id) ?? 0;
    }
  };
  decorate(mNodes, mEdges);

  const mAdj = new Map<string, string[]>();
  for (const e of mEdges) {
    if (!mAdj.has(e.source)) mAdj.set(e.source, []);
    mAdj.get(e.source)!.push(e.target);
  }
  const mSccs = tarjanSCC(mNodes.map((n) => n.id), mAdj);
  const cycleIds = new Set(mSccs.flat());
  for (const n of mNodes) n.inCycle = cycleIds.has(n.id);

  const moduleGraph: ArchitectureGraph = {
    level: "module",
    nodes: mNodes.sort((a, b) => b.loc - a.loc),
    edges: mEdges,
    cycles: mSccs,
    topFanIn: [...mNodes].sort((a, b) => b.fanIn - a.fanIn).slice(0, 5).map((n) => ({ id: n.id, fanIn: n.fanIn })),
    externalDeps: [...externals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count })),
    unresolvedImports: unresolved,
  };

  // --- file-level graph (only feasible for small repos) ---
  let fileGraph: ArchitectureGraph | undefined;
  const fNodeCount = codeFiles.length;
  if (fNodeCount <= 100 && rawEdges.size <= 250) {
    const fNodes = codeFiles
      .map((f) => buildNode(f.file.path, f.file.path.split("/").pop()!, "file", f.lines, cxDegByFile.get(f.file.path) ?? 0));
    const fNodeIds = new Set(fNodes.map((n) => n.id));
    const fEdges: GraphEdge[] = [...rawEdges.entries()]
      .map(([k, weight]) => {
        const [source, target] = k.split("->");
        return { source, target, weight };
      })
      .filter((e) => fNodeIds.has(e.source) && fNodeIds.has(e.target));
    decorate(fNodes, fEdges);
    const fAdj = new Map<string, string[]>();
    for (const e of fEdges) {
      if (!fAdj.has(e.source)) fAdj.set(e.source, []);
      fAdj.get(e.source)!.push(e.target);
    }
    const fSccs = tarjanSCC(fNodes.map((n) => n.id), fAdj);
    const fCycleIds = new Set(fSccs.flat());
    for (const n of fNodes) n.inCycle = fCycleIds.has(n.id);
    fileGraph = {
      level: "file",
      nodes: fNodes.sort((a, b) => b.loc - a.loc),
      edges: fEdges,
      cycles: fSccs,
      topFanIn: [...fNodes].sort((a, b) => b.fanIn - a.fanIn).slice(0, 5).map((n) => ({ id: n.id, fanIn: n.fanIn })),
      externalDeps: moduleGraph.externalDeps,
      unresolvedImports: unresolved,
    };
  }

  const findings: Finding[] = [];
  if (mSccs.length > 0) {
    findings.push({
      id: "graph.cycles",
      category: "maintainability",
      severity: "major",
      title: `${mSccs.length} circular module dependenc${mSccs.length > 1 ? "ies" : "y"} detected`,
      detail:
        mSccs.slice(0, 3).map((c) => `• ${c.join(" → ")} → ${c[0]}`).join("\n") +
        "\nCycles make modules untestable in isolation — break them by extracting a shared lower-level module.",
      penalty: 10,
    });
  }

  return { graph: moduleGraph, fileGraph, findings };
}
