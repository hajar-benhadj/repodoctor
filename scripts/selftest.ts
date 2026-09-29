// Offline selftest: analyzes fixtures/sample-repo (a deliberately unhealthy
// project) and asserts the engine catches the seeded issues.

import path from "path";
import { analyzeRepository } from "../lib/analyzer";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

async function main() {
  const fixture = path.resolve(__dirname, "..", "fixtures", "sample-repo");
  console.log("🧪 RepoDoctor selftest on fixtures/sample-repo\n");

  const result = await analyzeRepository({
    jobId: "selftest",
    repoUrl: "local/sample-repo",
    localDir: fixture,
  });

  console.log(`Overall: ${result.scores.overall}/100 (${result.scores.grade})\n`);

  const byId = new Map(result.findings.map((f) => [f.id, f]));

  console.log("Security:");
  check("detects the AWS access key", byId.has("security.awskeys"));
  check("detects the generic hardcoded secret", byId.has("security.generic"));
  check("detects committed .env file", byId.has("security.credentialfiles"));
  check("flags eval()", byId.has("security.pattern.eval"));
  check("flags TLS bypass", byId.has("security.pattern.tls"));
  check("flags shell=True / interpolated exec", byId.has("security.pattern.shell"));
  check("flags verify=False", byId.has("security.pattern.pyverify"));
  check("flags missing lockfile", byId.has("security.nolock"));
  check("security score is capped by criticals", result.scores.categories.find((c) => c.key === "security")!.score <= 55);

  console.log("Quality:");
  check("flags high complexity", byId.has("quality.complexity"));
  check("detects the duplicated block", byId.has("quality.duplication"));

  console.log("Testing:");
  check("flags thin testing", byId.has("testing.ratio") || byId.has("testing.notests"));
  check("flags missing CI", byId.has("testing.noci"));

  console.log("Documentation:");
  check("flags near-empty README", byId.has("documentation.readmemd"));
  check("flags missing LICENSE", byId.has("documentation.license"));

  console.log("Maintainability & graph:");
  check("bus factor finding present", byId.has("maintainability.busfactor"));
  check("import graph has nodes", result.architecture.nodes.length > 0, `got ${result.architecture.nodes.length}`);
  check("action plan is non-empty", result.plan.length > 0);
  check("overall grade is D or F", ["D", "F"].includes(result.scores.grade), `got ${result.scores.grade}`);

  console.log(failures === 0 ? "\n✅ All checks passed" : `\n❌ ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`✗ selftest crashed: ${e.stack ?? e.message ?? e}`);
  process.exit(1);
});
