// Maintainability: hygiene configs, TODO debt, bus factor, structure.

import { Finding, RepoMeta } from "../types";
import { LoadedFile } from "./context";
import { QualityMetrics } from "./quality";

export interface MaintainabilityInputs {
  loaded: LoadedFile[];
  auxContents: Map<string, string>;
  files: { path: string }[];
  meta: RepoMeta;
  quality: QualityMetrics;
  depCount: number;
}

export function analyzeMaintainability(inputs: MaintainabilityInputs): Finding[] {
  const { loaded, auxContents, files, meta, quality, depCount } = inputs;
  const findings: Finding[] = [];

  const linterConfigs = [
    ".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml", ".eslintrc.cjs",
    "eslint.config.js", "eslint.config.mjs", "eslint.config.ts",
    ".prettierrc", ".prettierrc.json", ".prettierrc.yml", ".prettierrc.js", "prettier.config.js", "prettier.config.mjs",
    "biome.json", "biome.jsonc", ".editorconfig",
    "ruff.toml", ".ruff.toml", ".flake8", "tox.ini", ".stylelintrc",
    ".golangci.yml", ".rubocop.yml", ".php-cs-fixer.dist.php", ".scalafmt.conf", "rustfmt.toml", ".clang-format",
  ];
  const hasLinterConfig =
    files.some((f) => linterConfigs.includes((f.path.split("/").pop() ?? "").toLowerCase())) ||
    /\[tool\.(ruff|black|flake8|mypy|isort)\]/.test(auxContents.get("pyproject.toml") ?? "") ||
    /\[tool\.(ruff|black|flake8|mypy|isort)\]/.test(auxContents.get("Cargo.toml") ?? "");

  const relevantLangs = Object.keys(meta.languages);
  const checksStyle = relevantLangs.some((l) => ["JavaScript", "TypeScript", "Python"].includes(l));
  if (checksStyle && !hasLinterConfig) {
    findings.push({
      id: "maintainability.linter",
      category: "maintainability",
      severity: "minor",
      title: "No linter/formatter configuration",
      detail: "No ESLint/Prettier/Biome/Ruff/Black config found. Automated style enforcement ends nitpicking in review.",
      penalty: 4,
    });
  }

  let todoCount = 0;
  const todoFiles = new Map<string, number>();
  for (const f of loaded) {
    const matches = f.raw.match(/\b(TODO|FIXME|HACK|XXX)\b/g);
    if (matches) {
      todoCount += matches.length;
      todoFiles.set(f.file.path, (todoFiles.get(f.file.path) ?? 0) + matches.length);
    }
  }
  const perKloc = quality.totalLoc > 0 ? todoCount / (quality.totalLoc / 1000) : 0;
  if (perKloc > 1.5 && todoCount >= 5) {
    const top = [...todoFiles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([file, n]) => `• ${file} (${n})`).join("\n");
    findings.push({
      id: "maintainability.todos",
      category: "maintainability",
      severity: "minor",
      title: `TODO/FIXME debt: ${todoCount} markers (${perKloc.toFixed(1)} per kLOC)`,
      detail: "Untriaged TODOs rot into bugs. Triage them into issues:\n" + top,
      penalty: 4,
    });
  }

  if (meta.contributors > 0 && meta.busFactor === 1) {
    findings.push({
      id: "maintainability.busfactor",
      category: "maintainability",
      severity: "major",
      title: "Bus factor is 1",
      detail: `${meta.contributors > 1 ? "One person accounts for" : "Effectively one contributor behind"} 50%+ of all contributions. Key-person risk: document decisions, add CODEOWNERS, recruit co-maintainers.`,
      penalty: 10,
    });
  }

  if (meta.archived) {
    findings.push({
      id: "maintainability.archived",
      category: "maintainability",
      severity: "info",
      title: "Repository is archived",
      detail: "The project is read-only upstream. Factor that into any adoption decision.",
      penalty: 1,
    });
  } else if (meta.pushedAt) {
    const months = (Date.now() - new Date(meta.pushedAt).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (months > 24) {
      findings.push({
        id: "maintainability.stale",
        category: "maintainability",
        severity: "info",
        title: `Last commit was ${Math.round(months / 12)} year(s) ago`,
        detail: "Inactive projects accumulate unpatched dependencies and drifting docs.",
        penalty: 1,
      });
    }
  }

  if (depCount > 80) {
    findings.push({
      id: "maintainability.deps",
      category: "maintainability",
      severity: "minor",
      title: `Large direct dependency count (${depCount})`,
      detail: "Every dependency is a supply-chain and upgrade liability. Audit for removals and dedupe.",
      penalty: 4,
    });
  }

  const dirCount = new Map<string, number>();
  for (const f of loaded) {
    const parts = f.file.path.split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join("/");
      dirCount.set(dir, (dirCount.get(dir) ?? 0) + 1);
    }
  }
  const crowded = [...dirCount.entries()].filter(([, n]) => n >= 50).sort((a, b) => b[1] - a[1]);
  if (crowded.length > 0) {
    findings.push({
      id: "maintainability.fanout",
      category: "maintainability",
      severity: "minor",
      title: `${crowded.length} very large director${crowded.length > 1 ? "ies" : "y"} (≥50 source files)`,
      detail: crowded.slice(0, 4).map(([d, n]) => `• ${d}/ (${n} files)`).join("\n") + "\nGroup by feature/domain instead of dumping everything together.",
      penalty: 4,
    });
  }

  return findings;
}
