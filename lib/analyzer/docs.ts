// Documentation: README quality, license, community files, docstring coverage.

import { Finding } from "../types";
import { LoadedFile } from "./context";
import { QualityMetrics } from "./quality";

export interface DocsInputs {
  auxContents: Map<string, string>;
  loaded: LoadedFile[];
  files: { path: string }[];
  licenseSpdx: string | null;
  contributors: number;
  quality: QualityMetrics;
}

export interface DocsResult {
  findings: Finding[];
  hasReadme: boolean;
  readmeSections: string[];
}

export function analyzeDocumentation(inputs: DocsInputs): DocsResult {
  const { auxContents, files, licenseSpdx, contributors, quality } = inputs;
  const findings: Finding[] = [];

  const readmePath = files
    .map((f) => f.path)
    .find((p) => /^readme(\.md|\.rst|\.txt)?$/i.test(p.split("/").pop() ?? ""));
  const readme = readmePath ? auxContents.get(readmePath) : undefined;
  const sections: string[] = [];

  if (!readmePath || readme === undefined) {
    findings.push({
      id: "documentation.readme",
      category: "documentation",
      severity: "critical",
      title: "No README",
      detail: "The repository has no README file. Newcomers (and recruiters) have no entry point.",
      penalty: 30,
    });
  } else {
    const lower = readme.toLowerCase();
    const checks: [string, RegExp][] = [
      ["installation", /(^#+\s*(install|installation|setup|getting started))|(\b(?:npm (i|install)|pip install|go get|cargo build|docker (run|compose)))/],
      ["usage", /(^#+\s*(usage|getting started|quick ?start))|(```)/],
      ["examples", /^#+\s*(examples?|demo)/m],
      ["api reference", /^#+\s*(api|reference|docs)/m],
      ["license", /^#+\s*licen[cs]e/m],
      ["contributing", /^#+\s*contribut/m],
    ];
    for (const [name, re] of checks) if (re.test(lower)) sections.push(name);
    const hasBadges = /\[!\[[^\]]*\]\(/.test(readme);

    if (readme.length < 400) {
      findings.push({
        id: "documentation.readmemd",
        category: "documentation",
        severity: "major",
        title: "README is nearly empty",
        detail: `README is only ${readme.length} characters. Cover: what it is, installation, usage, examples.`,
        penalty: 10,
      });
    } else {
      const missing = ["installation", "usage"].filter((s) => !sections.includes(s));
      if (missing.length > 0) {
        findings.push({
          id: "documentation.sections",
          category: "documentation",
          severity: "minor",
          title: `README missing essential section${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
          detail: `Sections detected: ${sections.length ? sections.join(", ") : "none"}.${hasBadges ? " Badges detected." : ""} Add the missing ones with copy-pasteable commands.`,
          penalty: 4,
        });
      }
    }
  }

  const hasLicenseFile = files.some((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/.test((f.path.split("/").pop() ?? "").toLowerCase()));
  if (!licenseSpdx && !hasLicenseFile) {
    findings.push({
      id: "documentation.license",
      category: "documentation",
      severity: "major",
      title: "No LICENSE file",
      detail: "Without a license, nobody can legally reuse the code. Pick one (MIT/Apache-2.0) and commit it.",
      penalty: 10,
    });
  }

  const hasContributing = files.some((f) => /^(\.github\/)?contributing(\.md)?$/i.test(f.path));
  if (!hasContributing && contributors >= 3) {
    findings.push({
      id: "documentation.contributing",
      category: "documentation",
      severity: "info",
      title: "No CONTRIBUTING guide for external contributors",
      detail: `${contributors} contributors but no CONTRIBUTING.md — add setup + PR conventions.`,
      penalty: 1,
    });
  }

  const fns = quality.functions.filter((f) => ["js", "python"].includes(f.file.split(".").pop() === "py" ? "python" : "js"));
  if (fns.length >= 20) {
    const docRatio = fns.filter((f) => f.hasDoc).length / fns.length;
    if (docRatio < 0.05) {
      findings.push({
        id: "documentation.docstrings",
        category: "documentation",
        severity: "major",
        title: `Almost no docstrings/JSDoc (${Math.round(docRatio * 100)}% of ${fns.length} functions)`,
        detail: "Document public functions at minimum — the exported API surface.",
        penalty: 10,
      });
    } else if (docRatio < 0.2) {
      findings.push({
        id: "documentation.docstrings",
        category: "documentation",
        severity: "minor",
        title: `Sparse docstrings/JSDoc (${Math.round(docRatio * 100)}% of ${fns.length} functions)`,
        detail: "Aim for ≥ 60% on exported functions.",
        penalty: 4,
      });
    }
  }

  if (quality.totalLoc > 3000 && quality.commentRatio < 1.5) {
    findings.push({
      id: "documentation.comments",
      category: "documentation",
      severity: "minor",
      title: `Very low comment density (${quality.commentRatio}% of lines)`,
      detail: "Complex algorithms and public APIs deserve inline explanations.",
      penalty: 4,
    });
  }

  return { findings, hasReadme: !!readmePath, readmeSections: sections };
}
