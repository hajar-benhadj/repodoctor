// JSON-file persistence for jobs and results (swap for Postgres in production).

import * as fsSync from "fs";
import fs from "fs";
import path from "path";
import { AnalysisResult, Job } from "./types";

const DATA_DIR = process.env.REPODOCTOR_DATA_DIR ?? path.join(process.cwd(), "data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");
const RESULTS_DIR = path.join(DATA_DIR, "results");

function ensureDirs() {
  fsSync.mkdirSync(RESULTS_DIR, { recursive: true });
}

export function loadJobs(): Job[] {
  try {
    return JSON.parse(fsSync.readFileSync(JOBS_FILE, "utf8")) as Job[];
  } catch {
    return [];
  }
}

export function saveJob(job: Job) {
  ensureDirs();
  const jobs = loadJobs().filter((j) => j.id !== job.id);
  jobs.push(job);
  fsSync.writeFileSync(JOBS_FILE, JSON.stringify(jobs.slice(-200), null, 2));
}

export function getJob(id: string): Job | undefined {
  return loadJobs().find((j) => j.id === id);
}

export function saveResult(result: AnalysisResult) {
  ensureDirs();
  fsSync.writeFileSync(path.join(RESULTS_DIR, `${result.id}.json`), JSON.stringify(result));
}

export function getResult(id: string): AnalysisResult | null {
  try {
    return JSON.parse(fsSync.readFileSync(path.join(RESULTS_DIR, `${id}.json`), "utf8")) as AnalysisResult;
  } catch {
    return null;
  }
}

// Idempotency: reuse a recent result for the same repo (default branch).
export function findRecentResult(owner: string, repo: string, maxAgeMs = 24 * 60 * 60 * 1000): AnalysisResult | null {
  const jobs = loadJobs()
    .filter((j) => j.owner === owner && j.repo === repo && j.status === "done" && j.resultId)
    .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));
  for (const j of jobs) {
    if (j.finishedAt && Date.now() - new Date(j.finishedAt).getTime() < maxAgeMs) {
      const r = getResult(j.resultId!);
      if (r) return r;
    }
  }
  return null;
}

export function listRecentResults(limit = 8): AnalysisResult[] {
  const jobs = loadJobs()
    .filter((j) => j.status === "done" && j.resultId)
    .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))
    .slice(0, limit);
  const out: AnalysisResult[] = [];
  for (const j of jobs) {
    const r = getResult(j.resultId!);
    if (r) out.push(r);
  }
  return out;
}
