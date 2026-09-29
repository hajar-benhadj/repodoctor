// CLI: npx tsx scripts/analyze-cli.ts <github-url> [--token=ghp_xxx]
// Runs the full engine outside Next.js and saves the result to data/results
// (with a Job record, so it shows up in the app's recent diagnoses).

import { randomUUID } from "crypto";
import { analyzeRepository } from "../lib/analyzer";
import { saveJob, saveResult } from "../lib/store";
import { CATEGORY_LABELS } from "../lib/types";

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith("--"));
  const tokenArg = args.find((a) => a.startsWith("--token="));
  const token = tokenArg?.split("=")[1] ?? process.env.GITHUB_TOKEN;

  if (!url) {
    console.error("Usage: npm run analyze -- <github-url> [--token=xxx]");
    process.exit(1);
  }

  console.log(`🩺 RepoDoctor — analyzing ${url}\n`);
  const t0 = Date.now();
  const jobId = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await analyzeRepository({
    jobId,
    repoUrl: url,
    token,
    onProgress: (stage, p, msg) => {
      process.stdout.write(`\r[${String(p).padStart(3)}%] ${stage.padEnd(9)} ${msg.slice(0, 70)}   `);
    },
  });
  process.stdout.write("\n\n");

  console.log(`Overall: ${result.scores.overall}/100 (grade ${result.scores.grade})\n`);
  for (const c of result.scores.categories) {
    const bar = "█".repeat(Math.round(c.score / 5)) + "░".repeat(20 - Math.round(c.score / 5));
    console.log(`${CATEGORY_LABELS[c.key].padEnd(16)} ${bar} ${String(c.score).padStart(3)}%`);
  }
  console.log(`\nFindings (${result.findings.length}):`);
  for (const f of result.findings.slice(0, 15)) {
    console.log(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.title}  −${f.penalty}`);
  }
  if (result.findings.length > 15) console.log(`  … and ${result.findings.length - 15} more`);

  console.log(`\nArchitecture: ${result.architecture.nodes.length} modules, ${result.architecture.edges.length} edges, ${result.architecture.cycles.length} cycle(s)`);
  console.log(`Prescription:`);
  for (const p of result.plan.slice(0, 5)) {
    console.log(`  ${p.rank}. [${p.impact}/${p.effort}] ${p.title}`);
  }
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

  saveResult(result);
  saveJob({
    id: result.id,
    repoUrl: result.repo.url,
    owner: result.repo.owner,
    repo: result.repo.name,
    status: "done",
    stage: "done",
    progress: 100,
    message: "Analyzed via CLI.",
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    resultId: result.id,
    summary: { overall: result.scores.overall, grade: result.scores.grade },
  });
  console.log(`Saved to data/results/${result.id}.json`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message ?? e}`);
  process.exit(1);
});
