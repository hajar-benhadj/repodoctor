// Explainable scoring: transparent penalty model + prioritized action plan.

import {
  AnalysisStats,
  Category,
  CategoryScore,
  Finding,
  Finding as FindingType,
  PlanItem,
  ScoreReport,
  CATEGORY_LABELS,
} from "../types";

const WEIGHTS: { key: Category; weight: number }[] = [
  { key: "quality", weight: 0.25 },
  { key: "security", weight: 0.25 },
  { key: "testing", weight: 0.2 },
  { key: "documentation", weight: 0.15 },
  { key: "maintainability", weight: 0.15 },
];

const RATIO_FINDING_IDS = new Set(["testing.notests", "testing.ratio"]);

export interface ScoreContext {
  testRatio: number;
  sourceLoc: number;
  filesAnalyzed: number;
  filesTotal: number;
  languages: string[];
  partial: boolean;
}

export function computeScores(findings: FindingType[], ctx: ScoreContext): ScoreReport {
  const categories: CategoryScore[] = [];

  for (const { key } of WEIGHTS) {
    const catFindings = findings.filter((f) => f.category === key);
    const contributions: { title: string; penalty: number }[] = [];
    let score = 100;
    let note: string | undefined;

    if (key === "testing") {
      const curvePenalty =
        ctx.sourceLoc > 0
          ? Math.max(0, 100 - Math.min(100, Math.round((ctx.testRatio / 0.6) * 100)))
          : 0;
      const extra = catFindings
        .filter((f) => !RATIO_FINDING_IDS.has(f.id))
        .reduce((a, f) => a + f.penalty, 0);
      score = Math.max(5, Math.min(100, 100 - curvePenalty - extra));
      contributions.push({
        title: `Test-to-code ratio ${Math.round(ctx.testRatio * 100)}% (target ≥ 60%)`,
        penalty: curvePenalty,
      });
      for (const f of catFindings.filter((f) => !RATIO_FINDING_IDS.has(f.id))) {
        contributions.push({ title: f.title, penalty: f.penalty });
      }
      note = "Driven by the test-to-code ratio, minus CI/coverage penalties.";
    } else {
      const penalty = Math.min(100, catFindings.reduce((a, f) => a + f.penalty, 0));
      score = Math.max(0, 100 - penalty);
      for (const f of [...catFindings].sort((a, b) => b.penalty - a.penalty)) {
        contributions.push({ title: f.title, penalty: f.penalty });
      }
      const criticals = catFindings.filter((f) => f.severity === "critical").length;
      if (criticals >= 2) score = Math.min(score, 35);
      else if (criticals === 1) score = Math.min(score, 55);
      if (key === "documentation" && catFindings.some((f) => f.id === "documentation.readme")) {
        score = Math.min(score, 12);
      }
    }

    categories.push({
      key,
      label: CATEGORY_LABELS[key],
      score,
      penalty: 100 - score,
      contributions,
      note,
    });
  }

  const overall = Math.round(
    categories.reduce((a, c) => a + c.score * (WEIGHTS.find((w) => w.key === c.key)!.weight), 0)
  );
  const grade =
    overall >= 93 ? "A+" : overall >= 85 ? "A" : overall >= 75 ? "B" : overall >= 65 ? "C" : overall >= 50 ? "D" : "F";

  return {
    overall,
    grade,
    categories,
    confidence: {
      filesAnalyzed: ctx.filesAnalyzed,
      filesTotal: ctx.filesTotal,
      languages: ctx.languages,
      partial: ctx.partial,
    },
  };
}

interface Template {
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
}

const TEMPLATES: Record<string, Template> = {
  "security.privatekey": { title: "Rotate the exposed private key immediately", detail: "Generate a new key pair, update every consumer, and purge the old key from git history with git filter-repo. Consider it compromised from the moment it was pushed.", impact: "high", effort: "low" },
  "security.awskeys": { title: "Revoke and rotate the exposed AWS keys", detail: "Deactivate the key in IAM, create a new one, and audit CloudTrail for misuse during the exposure window.", impact: "high", effort: "low" },
  "security.tokens.gh": { title: "Revoke the exposed token and rotate it", detail: "Revoke in provider settings, issue a new credential, move it to CI secrets / .env (gitignored).", impact: "high", effort: "low" },
  "security.tokens.google": { title: "Rotate the exposed Google API key", detail: "Regenerate the key, restrict it by referrer/IP/API in Google Cloud console.", impact: "high", effort: "low" },
  "security.tokens.slack": { title: "Rotate the exposed Slack token", detail: "Revoke and reinstall the app to get a fresh token; store in secrets manager.", impact: "high", effort: "low" },
  "security.tokens.stripe": { title: "Rotate the exposed Stripe live key", detail: "Roll the key in the Stripe dashboard and audit recent charges.", impact: "high", effort: "low" },
  "security.tokens.npm": { title: "Rotate the exposed npm token", detail: "Revoke in npm settings; audit recent publishes; move token to CI secrets.", impact: "high", effort: "low" },
  "security.tokens.gitlab": { title: "Rotate the exposed GitLab token", detail: "Revoke and reissue with minimal scopes.", impact: "high", effort: "low" },
  "security.tokens.openai": { title: "Rotate the exposed OpenAI API key", detail: "Revoke the key and check usage for anomalies; move to env vars.", impact: "high", effort: "low" },
  "security.tokens.sendgrid": { title: "Rotate the exposed SendGrid key", detail: "Delete and recreate the API key with minimal scopes.", impact: "high", effort: "low" },
  "security.tokens.telegram": { title: "Rotate the exposed Telegram bot token", detail: "Revoke via @BotFather (/revoke) and audit messages.", impact: "high", effort: "low" },
  "security.generic": { title: "Move hardcoded credentials out of source", detail: "Replace with environment variables, then rotate each value — it is already in history.", impact: "high", effort: "low" },
  "security.credentialfiles": { title: "Remove credential files from the repository", detail: "git rm --cached, add to .gitignore, purge history (git filter-repo) and rotate contents.", impact: "high", effort: "low" },
  "security.deps": { title: "Patch vulnerable dependencies", detail: "Run the ecosystem audit (npm audit / pip-audit / cargo audit), bump affected packages, and wire the audit into CI so regressions fail the build.", impact: "high", effort: "low" },
  "security.nolock": { title: "Commit a lockfile", detail: "Commit package-lock.json / yarn.lock / pnpm-lock.yaml so installs are reproducible and auditable.", impact: "medium", effort: "low" },
  "security.pattern.eval": { title: "Eliminate eval()/new Function()", detail: "Replace dynamic evaluation with explicit logic, a lookup table, or a safe parser (JSON Schema validation).", impact: "high", effort: "medium" },
  "security.pattern.tls": { title: "Re-enable TLS certificate verification", detail: "Remove rejectUnauthorized:false; for dev CAs, add them to the trust store instead of disabling checks.", impact: "high", effort: "low" },
  "security.pattern.shell": { title: "Stop building shell commands from interpolated input", detail: "Use execFile/spawn without shell:true (Node) or subprocess without shell=True (Python), passing arguments as arrays.", impact: "high", effort: "low" },
  "security.pattern.pickle": { title: "Replace pickle deserialization", detail: "Use JSON for data exchange; if pickle is required, authenticate payloads first (HMAC) and never unpickle user input.", impact: "high", effort: "medium" },
  "security.pattern.pyverify": { title: "Re-enable SSL verification in requests", detail: "Remove verify=False; for self-signed certs pass a CA bundle instead.", impact: "high", effort: "low" },
  "security.pattern.yamload": { title: "Use yaml.safe_load()", detail: "yaml.load without SafeLoader can execute arbitrary constructors — swap to safe_load everywhere.", impact: "high", effort: "low" },
  "security.pattern.pyexec": { title: "Remove exec()/eval() usage", detail: "Replace dynamic execution with explicit dispatch (dict of handlers).", impact: "medium", effort: "medium" },
  "security.pattern.dangerhtml": { title: "Sanitize dangerouslySetInnerHTML input", detail: "Render text instead where possible; otherwise sanitize with DOMPurify before injecting.", impact: "medium", effort: "low" },
  "security.pattern.mktemp": { title: "Use safe temp file APIs", detail: "Replace tempfile.mktemp with NamedTemporaryFile or mkstemp to avoid race conditions.", impact: "low", effort: "low" },
  "quality.complexity": { title: "Refactor the highest-complexity functions", detail: "Start with the top 5 offenders: extract helpers, replace branch chains with early returns and lookup tables. Target cx ≤ 10 per function.", impact: "high", effort: "medium" },
  "quality.godfiles": { title: "Split god files into focused modules", detail: "Group by responsibility (parsing, IO, orchestration) and extract classes/modules; keep files under ~300 lines.", impact: "medium", effort: "medium" },
  "quality.longfiles": { title: "Split the largest files", detail: "Extract cohesive sections into their own modules.", impact: "low", effort: "medium" },
  "quality.nesting": { title: "Flatten deeply nested code", detail: "Introduce guard clauses/early returns and invert conditions — nesting beyond 4 levels hides logic bugs.", impact: "medium", effort: "low" },
  "quality.duplication": { title: "Extract shared helpers from duplicated blocks", detail: "The flagged clones drift apart silently — consolidate each group into one function.", impact: "medium", effort: "medium" },
  "testing.notests": { title: "Stand up a test suite", detail: "Add the framework (vitest/jest/pytest), wire it into CI, and cover the 5 most critical functions first (parsing, auth, money paths).", impact: "high", effort: "medium" },
  "testing.ratio": { title: "Grow test coverage on critical paths", detail: "Prioritize pure logic and edge cases; aim for the 40–60% test-to-code range.", impact: "high", effort: "medium" },
  "testing.noci": { title: "Add a CI pipeline that runs tests", detail: "A minimal GitHub Actions workflow: install → lint → test on every push and PR.", impact: "high", effort: "low" },
  "testing.cinotests": { title: "Make CI actually run the tests", detail: "Add a test job/step to the existing workflow so failures block merges.", impact: "high", effort: "low" },
  "testing.coverage": { title: "Add coverage reporting", detail: "Enable coverage in the test runner and upload to codecov so the trend is visible.", impact: "low", effort: "low" },
  "documentation.readme": { title: "Write a proper README", detail: "Minimum sections: what it is (one paragraph), installation, quickstart usage with a copy-pasteable example, license.", impact: "medium", effort: "low" },
  "documentation.readmemd": { title: "Flesh out the README", detail: "Add installation, usage with examples, and a short FAQ/troubleshooting section.", impact: "medium", effort: "low" },
  "documentation.sections": { title: "Complete the missing README sections", detail: "Add the flagged sections with real, copy-pasteable commands — not placeholders.", impact: "medium", effort: "low" },
  "documentation.license": { title: "Add a LICENSE", detail: "Pick MIT (permissive) or Apache-2.0 (patent grant) and commit it — without one the code is unusable by others.", impact: "medium", effort: "low" },
  "documentation.contributing": { title: "Add a CONTRIBUTING guide", detail: "Document local setup, conventions, and the PR process.", impact: "low", effort: "low" },
  "documentation.docstrings": { title: "Adopt a docstring/JSDoc convention", detail: "Document all exported functions first; enforce with eslint-plugin-jsdoc / ruff pydocstyle.", impact: "low", effort: "medium" },
  "documentation.comments": { title: "Comment the non-obvious parts", detail: "Explain the why for algorithms and trade-offs — not the what.", impact: "low", effort: "low" },
  "maintainability.linter": { title: "Add linter + formatter configs", detail: "ESLint + Prettier (JS/TS) or Ruff + Black (Python), wired into CI and pre-commit hooks.", impact: "medium", effort: "low" },
  "maintainability.todos": { title: "Triage the TODO backlog", detail: "Convert actionable TODOs into issues; delete or document the rest.", impact: "low", effort: "low" },
  "maintainability.busfactor": { title: "Reduce key-person risk", detail: "Document architecture decisions (ADRs), add CODEOWNERS, and onboard at least one co-maintainer.", impact: "medium", effort: "medium" },
  "maintainability.deps": { title: "Prune direct dependencies", detail: "Audit each dependency for continued need; replace single-function deps with local code.", impact: "low", effort: "low" },
  "maintainability.fanout": { title: "Reorganize oversized directories", detail: "Group files by feature/domain to restore navigability.", impact: "low", effort: "medium" },
  "maintainability.archived": { title: "Note the archived status in your docs", detail: "Link forks/alternatives in the README so users know the state.", impact: "low", effort: "low" },
  "maintainability.stale": { title: "Refresh the project or mark it unmaintained", detail: "Update deps once, or add a maintenance-mode notice to the README.", impact: "low", effort: "low" },
};

export function buildPlan(findings: Finding[], cycleCount: number, stats: AnalysisStats): PlanItem[] {
  const ids = new Set(findings.map((f) => f.id));
  const items: Omit<PlanItem, "rank">[] = [];

  for (const [id, t] of Object.entries(TEMPLATES)) {
    if (ids.has(id)) {
      items.push({ title: t.title, detail: t.detail, impact: t.impact, effort: t.effort, relatedFindings: [id] });
    }
  }
  if (cycleCount > 0) {
    items.push({
      title: "Break circular module dependencies",
      detail: `${cycleCount} cycle(s) detected in the module graph — extract shared lower-level modules until dependencies form a DAG.`,
      impact: "medium",
      effort: "medium",
      relatedFindings: ["graph.cycles"],
    });
  }
  if (stats.byLanguage && Object.keys(stats.byLanguage).length > 0) {
    void stats;
  }

  const impactOrder = { high: 0, medium: 1, low: 2 };
  const effortOrder = { low: 0, medium: 1, high: 2 };
  items.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact] || effortOrder[a.effort] - effortOrder[b.effort]);
  return items.slice(0, 12).map((it, i) => ({ ...it, rank: i + 1 }));
}
