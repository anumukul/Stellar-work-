"use client";

import { acceptJob, getJob, getJobCount } from "@/lib/contract";
import { useWallet } from "@/lib/wallet-context";
import type { Job } from "@/lib/types";
import { useEffect, useState } from "react";

function toXlm(stroops: string) {
  return (Number(stroops) / 10_000_000).toFixed(2);
}

export default function HomePage() {
  const { wallet } = useWallet();
  const [jobs, setJobs] = useState<Array<{ id: number; job: Job }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const count = await getJobCount();
      const fetched: Array<{ id: number; job: Job }> = [];
      for (let id = 1; id <= count; id += 1) {
        const job = await getJob(String(id));
        if (job?.status === "Open") {
          fetched.push({ id, job });
        }
      }
      setJobs(fetched);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch jobs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Open Jobs</h1>

      {error && <p className="rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-slate-600">Loading jobs...</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map(({ id, job }) => (
          <article key={id} className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-medium">Job #{id}</h2>
            <p className="mt-2 text-sm text-slate-700">{toXlm(job.amount)} XLM</p>
            <p className="mt-1 text-xs text-slate-600">
              Hash: {job.description_hash.slice(0, 12)}...
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Deadline: {job.deadline === "0" ? "No deadline" : new Date(Number(job.deadline) * 1000).toLocaleString()}
            </p>
            <button
              className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              onClick={async () => {
                if (!wallet) return;
                await acceptJob(wallet, String(id));
                await refresh();
              }}
            >
              Accept Job
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
