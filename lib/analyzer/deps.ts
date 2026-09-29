// Dependency manifests → exact versions → OSV.dev batch vulnerability query.

import { Finding, VulnerableDep } from "../types";

export interface DepEntry {
  name: string;
  version: string;
  ecosystem: string;
}

export interface DepScan {
  findings: Finding[];
  vulnerableDeps: VulnerableDep[];
  depCount: number;
  osvOk: boolean;
  scanned: number;
}

const ECOSYSTEMS: Record<string, string> = {
  npm: "npm",
  pip: "PyPI",
  go: "Go",
  cargo: "crates.io",
  composer: "Packagist",
};

export function countDirectDeps(contents: Map<string, string>): number {
  let count = 0;
  const pkg = contents.get("package.json");
  if (pkg) {
    try {
      const j = JSON.parse(pkg);
      count += Object.keys(j.dependencies ?? {}).length;
      count += Object.keys(j.devDependencies ?? {}).length;
    } catch { /* malformed manifest — skip */ }
  }
  for (const [p, c] of contents) {
    if (/^requirements[\w.-]*\.txt$/.test(p)) {
      count += (c.match(/^\s*[A-Za-z0-9_.\-]+\s*[><=~!]=?/gm) ?? []).length;
    }
    if (p === "go.mod") {
      const req = c.match(/require\s*\(([\s\S]*?)\)/);
      if (req) count += (req[1].match(/^\s*\S+\s+v/gm) ?? []).length;
      else count += (c.match(/^\s*require\s+\S+\s+v/gm) ?? []).length;
    }
    if (p === "pom.xml") {
      count += (c.match(/<dependency>/g) ?? []).length;
    }
  }
  return count;
}

export function collectVersions(contents: Map<string, string>): DepEntry[] {
  const out = new Map<string, DepEntry>();
  const add = (name: string, version: string, ecosystem: string) => {
    if (!name || !version) return;
    if (!/^[0-9]/.test(version)) return; // OSV needs exact versions
    if (version.includes("*")) return;
    const key = `${ecosystem}:${name}@${version}`;
    if (!out.has(key)) out.set(key, { name, version, ecosystem });
  };

  // package-lock.json v2/v3
  const pkgLock = contents.get("package-lock.json");
  if (pkgLock) {
    try {
      const j = JSON.parse(pkgLock);
      const packages = j.packages ?? {};
      for (const [k, v] of Object.entries< { version?: string } >(packages)) {
        if (!k || !v?.version) continue;
        const name = k.replace(/^node_modules\//, "").replace(/\/node_modules\//, "::");
        if (name.includes("::")) continue;
        if (k === "" || k === "node_modules") continue;
        add(name, v.version, "npm");
      }
      // v1 fallback
      if (!Object.keys(packages).length && j.dependencies) {
        const walk = (deps: Record<string, { version?: string; dependencies?: Record<string, unknown> }>) => {
          for (const [name, v] of Object.entries(deps)) {
            if (v.version) add(name, v.version, "npm");
            if (v.dependencies) walk(v.dependencies as Record<string, { version?: string; dependencies?: Record<string, unknown> }>);
          }
        };
        walk(j.dependencies);
      }
    } catch { /* malformed lockfile */ }
  }

  // yarn.lock (v1 + berry)
  const yarn = contents.get("yarn.lock");
  if (yarn) {
    const blockRe = /^(?:#| |\t).*$/;
    let current: string[] = [];
    for (const raw of yarn.split(/\r?\n/)) {
      if (!raw.trim() || blockRe.test(raw)) continue;
      if (raw.endsWith(":")) {
        current = raw.slice(0, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
        continue;
      }
      const vm = raw.match(/^\s+version\s+"?([^"\s]+)"?/);
      if (vm && current.length) {
        for (const entry of current) {
          const at = entry.lastIndexOf("@");
          if (at > 0) add(entry.slice(0, at), vm[1], "npm");
        }
        current = [];
      }
    }
  }

  // pnpm-lock.yaml
  const pnpm = contents.get("pnpm-lock.yaml");
  if (pnpm) {
    const re = /^\s{2,}\/?((?:@[^/\s]+\/)?[^@\s(]+)@([^(:\s]+)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pnpm))) add(m[1], m[2], "npm");
  }

  // requirements*.txt
  for (const [p, c] of contents) {
    if (/^requirements[\w.-]*\.txt$/.test(p)) {
      const re = /^\s*([A-Za-z0-9_.\-]+)\s*==\s*([^;\s]+)/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(c))) add(m[1].toLowerCase().replace(/[-_.]+/g, "-"), m[2], "pip");
    }
  }

  // poetry.lock
  const poetry = contents.get("poetry.lock");
  if (poetry) {
    const re = /name\s*=\s*"([^"]+)"\s*\nversion\s*=\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(poetry))) add(m[1].toLowerCase().replace(/[-_.]+/g, "-"), m[2], "pip");
  }

  // go.sum
  const gosum = contents.get("go.sum");
  if (gosum) {
    const re = /^(\S+)\s+(v\S+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(gosum))) {
      if (!m[1].endsWith("/go.mod")) add(m[1], m[2], "go");
    }
  }

  // Cargo.lock
  const cargo = contents.get("Cargo.lock");
  if (cargo) {
    const re = /\[\[package\]\]\s*\nname\s*=\s*"([^"]+)"\s*\nversion\s*=\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cargo))) add(m[1], m[2], "cargo");
  }

  // composer.lock
  const composer = contents.get("composer.lock");
  if (composer) {
    try {
      const j = JSON.parse(composer);
      for (const section of ["packages", "packages-dev"]) {
        for (const p of j[section] ?? []) {
          if (p.name && p.version) add(p.name, p.version.replace(/^v/, ""), "composer");
        }
      }
    } catch { /* malformed lockfile */ }
  }

  return [...out.values()];
}

async function osvBatch(entries: DepEntry[]): Promise<{ id: string }[][]> {
  const res = await fetch("https://api.osv.dev/v1/querybatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queries: entries.map((e) => ({ package: { name: e.name, ecosystem: ECOSYSTEMS[e.ecosystem] ?? e.ecosystem }, version: e.version })),
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`OSV batch failed: HTTP ${res.status}`);
  const j = (await res.json()) as { results: { vulns?: { id: string }[] }[] };
  return j.results.map((r) => r.vulns ?? []);
}

export async function scanDependencies(
  contents: Map<string, string>,
  notes: string[],
  hasJsCode: boolean
): Promise<DepScan> {
  const findings: Finding[] = [];
  const entries = collectVersions(contents);
  const depCount = countDirectDeps(contents);
  const hasPkgJson = contents.has("package.json");
  const hasNpmLock = contents.has("package-lock.json") || contents.has("yarn.lock") || contents.has("pnpm-lock.yaml") || contents.has("npm-shrinkwrap.json");
  const hasPipPin = [...contents.keys()].some((k) => /^requirements[\w.-]*\.txt$/.test(k)) || contents.has("poetry.lock") || contents.has("Pipfile.lock");

  if (hasJsCode && hasPkgJson && !hasNpmLock) {
    findings.push({
      id: "security.nolock",
      category: "security",
      severity: "minor",
      title: "No lockfile committed",
      detail: "package.json exists but no package-lock.json / yarn.lock / pnpm-lock.yaml. Installs are not reproducible and dependency updates are unauditable.",
      penalty: 4,
    });
  } else if (hasJsCode && !hasPkgJson && !hasPipPin) {
    findings.push({
      id: "security.nolock",
      category: "security",
      severity: "info",
      title: "No dependency manifest or lockfile detected",
      detail: "Dependencies could not be audited for known vulnerabilities.",
      penalty: 1,
    });
  }

  const vulnerableDeps: VulnerableDep[] = [];
  let osvOk = true;
  if (entries.length > 0) {
    try {
      const vulnMap = new Map<number, { id: string }[]>();
      const CHUNK = 100;
      for (let i = 0; i < entries.length; i += CHUNK) {
        const chunk = entries.slice(i, i + CHUNK);
        const results = await osvBatch(chunk);
        results.forEach((r, idx) => vulnMap.set(i + idx, r));
      }
      for (const [idx, vulns] of vulnMap) {
        if (!vulns.length) continue;
        const e = entries[idx];
        vulnerableDeps.push({
          name: e.name,
          version: e.version,
          ecosystem: e.ecosystem,
          vulns: vulns.slice(0, 8).map((v) => ({
            id: v.id,
            url: `https://osv.dev/vulnerability/${v.id}`,
          })),
        });
      }
      vulnerableDeps.sort((a, b) => b.vulns.length - a.vulns.length);
    } catch {
      osvOk = false;
      notes.push("Dependency vulnerability scan skipped: OSV.dev was unreachable.");
    }
  }

  const totalVulns = vulnerableDeps.reduce((a, d) => a + d.vulns.length, 0);
  if (totalVulns > 0) {
    const critical = totalVulns >= 8 || vulnerableDeps.length >= 5;
    const listed = vulnerableDeps.slice(0, 8)
      .map((d) => `• ${d.name}@${d.version} (${d.ecosystem}) — ${d.vulns.length} known vuln${d.vulns.length > 1 ? "s" : ""}: ${d.vulns.slice(0, 3).map((v) => v.id).join(", ")}`)
      .join("\n");
    findings.push({
      id: "security.deps",
      category: "security",
      severity: critical ? "critical" : "major",
      title: `${vulnerableDeps.length} vulnerable dependenc${vulnerableDeps.length > 1 ? "ies" : "y"} with ${totalVulns} known vulnerabilities`,
      detail: `Detected via OSV.dev against exact locked versions:\n${listed}\nFull list with links in the Dependencies section.`,
      metric: `${totalVulns} vulnerabilities`,
      penalty: critical ? 25 : 10,
    });
  }

  return { findings, vulnerableDeps, depCount, osvOk, scanned: entries.length };
}
