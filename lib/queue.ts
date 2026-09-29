// In-process job manager with a worker loop, SSE-friendly eventing,
// and result caching. (Swap for BullMQ/Redis when scaling out.)

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { AnalysisResult, Job } from "./types";
import { analyzeRepository } from "./analyzer";
import { findRecentResult, getJob, loadJobs, saveJob, saveResult } from "./store";
import { GitHubError } from "./github";

const CONCURRENCY = 2;

class JobManager extends EventEmitter {
  private jobs = new Map<string, Job>();
  private running = 0;
  private initialized = false;

  constructor() {
    super();
    this.init();
  }

  private init() {
    if (this.initialized) return;
    this.initialized = true;
    // Jobs persisted as queued/running belong to a previous process lifetime.
    for (const j of loadJobs()) {
      if (j.status === "queued" || j.status === "running") {
        j.status = "error";
        j.error = "Interrupted by a server restart — run the diagnosis again.";
        saveJob(j);
      }
      this.jobs.set(j.id, j);
    }
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id) ?? getJob(id);
  }

  enqueue(repoUrl: string): { job: Job; cached: boolean } {
    const m = repoUrl.trim().match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
    const owner = m?.[1] ?? "unknown";
    const repo = m?.[2]?.replace(/\.git$/, "") ?? "unknown";

    // same repo already in flight → attach to it
    for (const j of this.jobs.values()) {
      if (j.owner === owner && j.repo === repo && (j.status === "queued" || j.status === "running")) {
        return { job: j, cached: false };
      }
    }
    // recent completed result → serve from cache
    const recent = findRecentResult(owner, repo);
    if (recent) {
      const job: Job = {
        id: randomUUID(),
        repoUrl: recent.repo.url,
        owner,
        repo,
        status: "done",
        stage: "done",
        progress: 100,
        message: "Served from cache (analyzed within the last 24h).",
        createdAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        cached: true,
        resultId: recent.id,
        summary: { overall: recent.scores.overall, grade: recent.scores.grade },
      };
      this.jobs.set(job.id, job);
      saveJob(job);
      return { job, cached: true };
    }

    const job: Job = {
      id: randomUUID(),
      repoUrl,
      owner,
      repo,
      status: "queued",
      stage: "queued",
      progress: 0,
      message: "Waiting for a worker…",
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    saveJob(job);
    queueMicrotask(() => this.pump());
    return { job, cached: false };
  }

  private pump() {
    while (this.running < CONCURRENCY) {
      const next = [...this.jobs.values()]
        .filter((j) => j.status === "queued")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!next) return;
      next.status = "running";
      this.emitUpdate(next);
      this.running++;
      this.run(next)
        .catch(() => {})
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }

  private async run(job: Job) {
    try {
      const token = process.env.GITHUB_TOKEN || undefined;
      const result: AnalysisResult = await analyzeRepository({
        jobId: job.id,
        repoUrl: job.repoUrl,
        token,
        onProgress: (stage, progress, message) => {
          job.stage = stage;
          job.progress = Math.min(99, Math.round(progress));
          job.message = message;
          this.emitUpdate(job);
        },
      });
      saveResult(result);
      job.status = "done";
      job.stage = "done";
      job.progress = 100;
      job.message = "Diagnosis complete.";
      job.resultId = result.id;
      job.summary = { overall: result.scores.overall, grade: result.scores.grade };
      job.finishedAt = new Date().toISOString();
    } catch (e) {
      job.status = "error";
      job.error =
        e instanceof GitHubError
          ? e.message
          : `Analysis failed unexpectedly: ${e instanceof Error ? e.message : String(e)}`;
      job.message = "Failed.";
      job.finishedAt = new Date().toISOString();
    }
    saveJob(job);
    this.emitUpdate(job);
  }

  private emitUpdate(job: Job) {
    saveJob(job);
    this.emit("update", { ...job });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __repodoctorQueue: JobManager | undefined;
}

export function getQueue(): JobManager {
  if (!globalThis.__repodoctorQueue) {
    globalThis.__repodoctorQueue = new JobManager();
  }
  return globalThis.__repodoctorQueue;
}
