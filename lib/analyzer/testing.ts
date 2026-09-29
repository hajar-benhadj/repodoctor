// Testing: test-to-code ratio, CI workflows, coverage config, e2e presence.

import { Finding } from "../types";
import { LoadedFile } from "./context";

export interface TestingMetrics {
  testLoc: number;
  sourceLoc: number;
  ratio: number;
  testFileCount: number;
  hasCI: boolean;
  ciRunsTests: boolean;
  hasCoverage: boolean;
  hasE2E: boolean;
}

const TEST_COMMAND_RE =
  /\b(npm\s+(run\s+)?test|yarn\s+(run\s+)?test|pnpm\s+(run\s+)?test|pytest|go\s+test|cargo\s+test|mvn\b[^&|]*test|gradle[^&|]*test|jest|vitest|phpunit|tox|make\s+test|ctest)\b/i;

export function analyzeTesting(
  loaded: LoadedFile[],
  auxContents: Map<string, string>
): { findings: Finding[]; metrics: TestingMetrics } {
  const findings: Finding[] = [];

  const codeFiles = loaded.filter((f) => f.file.lang?.analysis && f.file.lang.analysis !== "none");
  const testFiles = codeFiles.filter((f) => f.file.isTest);
  const testLoc = testFiles.reduce((a, f) => a + f.lines, 0);
  const sourceLoc = codeFiles.reduce((a, f) => a + f.lines, 0) - testLoc;
  const ratio = sourceLoc > 0 ? testLoc / sourceLoc : 0;

  const workflowPaths = [...auxContents.keys()].filter((k) => /^\.github\/workflows\/[^/]+\.(yml|yaml)$/.test(k));
  const hasCI = workflowPaths.length > 0 || auxContents.has(".gitlab-ci.yml") || auxContents.has("Jenkinsfile") || auxContents.has(".circleci/config.yml") || auxContents.has(".travis.yml");
  const ciRunsTests = workflowPaths.some((p) => TEST_COMMAND_RE.test(auxContents.get(p) ?? ""));

  const hasCoverage =
    auxContents.has("codecov.yml") ||
    auxContents.has(".coveragerc") ||
    /\[tool\.coverage\]/.test(auxContents.get("pyproject.toml") ?? "") ||
    /\[coverage/.test(auxContents.get("setup.cfg") ?? "") ||
    workflowPaths.some((p) => /coverage|codecov/i.test(auxContents.get(p) ?? ""));
  const hasE2E =
    loaded.some((f) => /(^|\/)(e2e|cypress)\//.test(f.file.path)) ||
    [...auxContents.keys()].some((k) => /playwright\.config\./.test(k));

  if (testFiles.length === 0) {
    findings.push({
      id: "testing.notests",
      category: "testing",
      severity: "critical",
      title: "No tests detected",
      detail: "Not a single test file was found. Every bug fix and refactor is a gamble — start with tests on the most critical paths.",
      penalty: 30,
    });
  } else if (ratio < 0.05) {
    findings.push({
      id: "testing.ratio",
      category: "testing",
      severity: "major",
      title: `Tests exist but coverage is minimal (${(ratio * 100).toFixed(1)}% test-to-code ratio)`,
      detail: `${testFiles.length} test file(s) for ${Math.round(sourceLoc / 1000)}k lines of source. Prioritize tests for critical paths (parsing, auth, money).`,
      penalty: 10,
    });
  } else if (ratio < 0.2) {
    findings.push({
      id: "testing.ratio",
      category: "testing",
      severity: "minor",
      title: `Test-to-code ratio is thin (${(ratio * 100).toFixed(1)}%)`,
      detail: `${testFiles.length} test file(s). A healthy target is ≥ 40–60%.`,
      penalty: 4,
    });
  }

  if (!hasCI) {
    findings.push({
      id: "testing.noci",
      category: "testing",
      severity: "major",
      title: "No CI configuration detected",
      detail: "No GitHub Actions / GitLab CI / CircleCI config found. Tests that don't run automatically don't protect anything.",
      penalty: 10,
    });
  } else if (!ciRunsTests) {
    findings.push({
      id: "testing.cinotests",
      category: "testing",
      severity: "minor",
      title: "CI exists but doesn't run tests",
      detail: "Workflows found, but none of them invoke a test runner. Add a test job to the pipeline.",
      penalty: 4,
    });
  }

  if (hasCI && ciRunsTests && !hasCoverage && ratio >= 0.05) {
    findings.push({
      id: "testing.coverage",
      category: "testing",
      severity: "info",
      title: "No coverage reporting configured",
      detail: "Add coverage (istanbul/vitest/pytest-cov) + a codecov/upload step to track the trend.",
      penalty: 1,
    });
  }

  return {
    findings,
    metrics: { testLoc, sourceLoc: Math.max(0, sourceLoc), ratio, testFileCount: testFiles.length, hasCI, ciRunsTests, hasCoverage, hasE2E },
  };
}
