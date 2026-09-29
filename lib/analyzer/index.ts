// The full analysis pipeline: fetch → parse → metrics → security → graph → score.

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { AnalysisResult, RepoMeta } from "../types";
import { downloadTarball, fetchRepoMeta, parseRepoUrl, GitHubError } from "../github";
import { CAPS, RepoFile } from "./walk";
import { readFileSafe, walkRepo } from "./walk";
import { LoadedFile } from "./context";
import { extract } from "tar";
import { analyzeQuality, QualityMetrics } from "./quality";
import { analyzeSecurity } from "./security";
import { scanDependencies } from "./deps";
import { analyzeDocumentation } from "./docs";
import { analyzeTesting, TestingMetrics } from "./testing";
import { analyzeMaintainability } from "./maintainability";
import { analyzeArchitecture } from "./graph";
import { buildPlan, computeScores } from "./score";

export type ProgressFn = (stage: string, progress: number, message: string) => void;

export interface AnalyzeOptions {
  jobId: string;
  repoUrl: string;
  token?: string;
  localDir?: string; // analyze a local directory instead of fetching (selftest/fixtures)
  onProgress?: ProgressFn;
}

const AUX_FILES = new Set([
  "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json",
  "requirements.txt", "requirements-dev.txt", "requirements_dev.txt", "poetry.lock", "Pipfile.lock",
  "go.sum", "go.mod", "Cargo.lock", "Cargo.toml", "composer.lock", "pom.xml",
  "pyproject.toml", "setup.cfg", "codecov.yml", ".coveragerc",
  ".gitlab-ci.yml", "Jenkinsfile",
]);

function fakeMetaForLocal(owner: string, name: string): RepoMeta {
  return {
    owner, name, description: "(local fixture)", stars: 0, forks: 0, openIssues: 0,
    defaultBranch: "main", primaryLanguage: null, languages: {}, license: null,
    createdAt: null, pushedAt: new Date().toISOString(), contributors: 1, busFactor: 1, archived: false,
  };
}

export async function analyzeRepository(opts: AnalyzeOptions): Promise<AnalysisResult> {
  const started = Date.now();
  const onProgress = opts.onProgress ?? (() => {});
  const notes: string[] = [];

  // ---------- resolve repo ----------
  let owner: string, name: string, ref = "main";
  let meta: RepoMeta;
  let tmpRoot: string | null = null;
  let root: string;

  if (opts.localDir) {
    const parsed = parseRepoUrl(opts.repoUrl);
    owner = parsed?.owner ?? "local";
    name = parsed?.repo ?? path.basename(opts.localDir);
    meta = fakeMetaForLocal(owner, name);
    root = opts.localDir;
    onProgress("fetch", 15, `Using local directory ${opts.localDir}`);
  } else {
    const parsed = parseRepoUrl(opts.repoUrl);
    if (!parsed) {
      throw new GitHubError("Could not parse that URL. Expected github.com/owner/repository.", 400);
    }
    owner = parsed.owner;
    name = parsed.repo;
    onProgress("fetch", 5, `Contacting GitHub for ${owner}/${name}…`);
    const fetched = await fetchRepoMeta(owner, name, opts.token);
    meta = fetched.meta;
    ref = parsed.ref ?? fetched.ref;
    onProgress("fetch", 15, `Downloading ${owner}/${name}@${ref}…`);

    tmpRoot = path.join(os.tmpdir(), "repodoctor", opts.jobId);
    await fs.mkdir(tmpRoot, { recursive: true });
    const tarball = path.join(tmpRoot, "repo.tar.gz");
    await downloadTarball(owner, name, ref, tarball, CAPS.maxArchiveBytes, opts.token);
    onProgress("fetch", 22, "Extracting archive…");
    try {
      await extract({ file: tarball, cwd: tmpRoot, strip: 1 });
    } catch {
      throw new GitHubError("Repository archive could not be extracted — the repo may be empty.", 422);
    }
    // Defensive rebase if the archive wrapped everything in a single directory.
    const entries = await fs.readdir(tmpRoot);
    if (entries.length === 1 && (await fs.stat(path.join(tmpRoot, entries[0]))).isDirectory()) {
      root = path.join(tmpRoot, entries[0]);
    } else {
      root = tmpRoot;
    }
  }

  try {
    // ---------- walk ----------
    onProgress("parse", 30, "Indexing files…");
    const walk = await walkRepo(root);
    const partial = walk.filesTotal > walk.files.length;

    // ---------- load contents ----------
    const loaded: LoadedFile[] = [];
    const auxContents = new Map<string, string>();
    let totalText = 0;
    const CRED_FILE_RE =
      /^(\.env(\..+)?|\.(pem|p12|pfx|key|tfstate)$|id_(rsa|dsa|ecdsa|ed25519)|credentials?\.json|service[-_]?account[^/]*\.json)$/i;

    for (const file of walk.files) {
      const base = file.path.split("/").pop() ?? "";
      const isAux =
        AUX_FILES.has(base) ||
        /^readme(\.md|\.rst|\.txt)?$/i.test(base) ||
        /^\.github\/workflows\/[^/]+\.(yml|yaml)$/.test(file.path) ||
        /^\.github\/(ISSUE_TEMPLATE|workflows)\//.test(file.path);
      if (isAux) {
        const c = await readFileSafe(root, file.path, CAPS.maxFileBytes);
        if (c !== null) auxContents.set(file.path, c);
        continue;
      }
      // credential-ish files (e.g. committed .env) must be scanned for secrets
      const isCred = CRED_FILE_RE.test(base);
      if (!file.lang && !isCred) continue;
      if (!isCred && file.lang!.analysis === "none") continue;
      if (totalText > CAPS.maxTotalTextBytes) continue;
      const raw = await readFileSafe(root, file.path, CAPS.maxFileBytes);
      if (raw === null) continue;
      totalText += raw.length;
      const { stripCommentsAndStrings } = await import("./text");
      // "none"-analysis files were filtered out above; credential files read as generic.
      const analysis: "js" | "python" | "generic" =
        isCred && !file.lang ? "generic" : (file.lang!.analysis as "js" | "python" | "generic");
      const code = stripCommentsAndStrings(raw, analysis);
      loaded.push({
        file: isCred && !file.lang
          ? { ...file, lang: { name: "Env/Key", analysis: "generic" } }
          : file,
        raw,
        code,
        lines: code ? raw.split("\n").length : 0,
      });
    }
    const languages = Object.entries(meta.languages)
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang);
    const analyzedLangs = [...new Set(loaded.map((f) => f.file.lang!.name))];
    onProgress("parse", 45, `Parsed ${loaded.length} source files (${(loaded.reduce((a, f) => a + f.lines, 0) / 1000).toFixed(0)}k lines)`);

    // ---------- quality ----------
    onProgress("quality", 55, "Measuring complexity, duplication…");
    const { findings: qualityFindings, metrics: qualityMetrics } = analyzeQuality(loaded);

    // ---------- security ----------
    onProgress("security", 65, "Scanning secrets & patterns…");
    const security = analyzeSecurity(loaded);
    onProgress("security", 72, "Querying OSV.dev for dependency vulnerabilities…");
    const hasJsCode = loaded.some((f) => f.file.lang?.analysis === "js");
    const deps = await scanDependencies(auxContents, notes, hasJsCode);

    // ---------- docs / testing / maintainability ----------
    const files = walk.files.map((f) => ({ path: f.path }));
    const docs = analyzeDocumentation({
      auxContents, loaded, files, licenseSpdx: meta.license,
      contributors: meta.contributors, quality: qualityMetrics,
    });
    const testing = analyzeTesting(loaded, auxContents);
    const maintainability = analyzeMaintainability({ loaded, auxContents, files, meta, quality: qualityMetrics, depCount: deps.depCount });

    // ---------- graph ----------
    onProgress("graph", 80, "Building architecture graph…");
    const arch = analyzeArchitecture(loaded, qualityMetrics);

    // ---------- scoring ----------
    onProgress("scoring", 90, "Computing scores…");
    const allFindings = [
      ...qualityFindings,
      ...security.findings,
      ...deps.findings,
      ...docs.findings,
      ...testing.findings,
      ...maintainability,
      ...arch.findings,
    ];
    const byLanguage: Record<string, { files: number; loc: number }> = {};
    for (const f of loaded) {
      const l = f.file.lang!.name;
      byLanguage[l] ??= { files: 0, loc: 0 };
      byLanguage[l].files++;
      byLanguage[l].loc += f.lines;
    }
    const stats = {
      filesAnalyzed: loaded.length,
      filesTotal: walk.filesTotal,
      totalLoc: qualityMetrics.totalLoc,
      durationMs: 0,
      byLanguage,
    };
    const scores = computeScores(allFindings, {
      testRatio: testing.metrics.ratio,
      sourceLoc: testing.metrics.sourceLoc,
      filesAnalyzed: loaded.length,
      filesTotal: walk.filesTotal,
      languages: analyzedLangs.length ? analyzedLangs : languages.slice(0, 3),
      partial,
    });
    const plan = buildPlan(allFindings, arch.graph.cycles.length, stats);

    if (partial) {
      notes.push(`Partial analysis: ${walk.files.length} of ${walk.filesTotal} files were analyzed (size/file-count caps). Scores are still representative but not exhaustive.`);
    }
    if (security.secretsFound > 0) {
      notes.push("⚠ Exposed secrets detected — rotate them and purge git history, not just the latest commit.");
    }
    if (arch.graph.unresolvedImports > 20) {
      notes.push(`${arch.graph.unresolvedImports} imports could not be resolved to local files — the architecture graph may be incomplete.`);
    }

    onProgress("scoring", 96, "Finalizing report…");
    stats.durationMs = Date.now() - started;

    return {
      id: opts.jobId,
      repo: { url: `https://github.com/${owner}/${name}`, owner, name, ref },
      meta,
      scores,
      findings: allFindings,
      architecture: arch.graph,
      fileGraph: arch.fileGraph,
      plan,
      stats,
      vulnerableDeps: deps.vulnerableDeps,
      notes,
      analyzedAt: new Date().toISOString(),
      prescription: null,
    };
  } finally {
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export type { QualityMetrics, TestingMetrics };
