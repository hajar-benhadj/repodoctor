"use client";

import { useEffect, useRef, useState } from "react";
import { AnalysisResult, Job } from "@/lib/types";
import ProgressView from "./ProgressView";
import Report from "./Report";

export default function AnalysisClient({ id }: { id: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFull() {
      const res = await fetch(`/api/analyze/${id}`);
      if (!res.ok) {
        if (!cancelled) setNotFound(true);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setJob(data.job);
      if (data.result) setResult(data.result);
      else subscribe();
    }

    function subscribe() {
      const es = new EventSource(`/api/analyze/${id}/events`);
      esRef.current = es;
      es.onmessage = (e) => {
        const update: Job = JSON.parse(e.data);
        setJob(update);
        if (update.status === "done") {
          es.close();
          fetch(`/api/analyze/${id}`)
            .then((r) => r.json())
            .then((d) => {
              if (!cancelled) setResult(d.result);
            });
        } else if (update.status === "error") {
          es.close();
        }
      };
      es.onerror = () => {
        es.close();
        // EventSource errors are expected when the server closes the stream on
        // completion — fall back to polling once to grab the final state.
        setTimeout(() => {
          if (cancelled) return;
          fetch(`/api/analyze/${id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (!d || cancelled) return;
              setJob(d.job);
              if (d.result) setResult(d.result);
            });
        }, 500);
      };
    }

    loadFull();
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [id]);

  if (notFound) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-bold mb-3">Diagnosis not found</h1>
        <p className="text-slate-400 mb-8">This analysis does not exist (or the server was restarted).</p>
        <a href="/" className="btn-primary">Back home</a>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-24">
        <div className="card p-8 animate-pulse text-center text-slate-500">Loading…</div>
      </main>
    );
  }

  if (job.status === "error") {
    return (
      <main className="max-w-3xl mx-auto px-6 py-24">
        <div className="card p-8 border-rose-500/40">
          <h1 className="text-2xl font-bold mb-2 text-rose-400">Diagnosis failed</h1>
          <p className="text-slate-300 mb-6">{job.error}</p>
          <div className="flex gap-3">
            <a href="/" className="btn-primary">Try another repository</a>
            <a href={`/analysis/${id}`} className="chip px-4 py-2.5">Refresh</a>
          </div>
        </div>
      </main>
    );
  }

  if (!result) {
    return <ProgressView job={job} />;
  }

  return <Report result={result} cached={!!job.cached} />;
}
