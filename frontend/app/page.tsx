"use client";

import { acceptJob, getJob, getJobCount } from "@/lib/contract";
import { useWallet } from "@/lib/wallet-context";
import type { Job } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

function toXlm(stroops: string) {
  return (Number(stroops) / 10_000_000).toFixed(2);
}

export default function HomePage() {
  const { wallet, connectWallet } = useWallet();
  const [jobs, setJobs] = useState<Array<{ id: number; job: Job }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const refresh = async () => {
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
  }, []);

  function getDescription(hash: string): string {
    const stored = localStorage.getItem(`job-desc:${hash}`);
    if (stored) return stored;
    return "Description unavailable (posted from another device)";
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Open Jobs</h1>

      {error && <p role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p role="status" aria-live="polite" className="text-sm text-slate-600">Loading jobs...</p>}

      {!loading && jobs.length === 0 && !error && (
        <p className="text-sm text-slate-600">No open jobs found.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map(({ id, job }) => (
          <article key={id} className="rounded-lg border border-slate-200 bg-white p-4">
            <Link href={`/job/${id}`} className="block">
              <h2 className="text-lg font-medium hover:underline">Job #{id}</h2>
            </Link>
            <p className="mt-2 text-sm text-slate-700">{toXlm(job.amount)} XLM</p>
            <p className="mt-1 text-sm text-slate-700">
              {getDescription(job.description_hash)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Hash: {job.description_hash.slice(0, 12)}...
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Deadline: {job.deadline === "0" ? "No deadline" : new Date(Number(job.deadline) * 1000).toLocaleString()}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Link
                href={`/job/${id}`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                View Details
              </Link>
             <button
                 className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                 onClick={async () => {
                   if (!wallet) {
                     try {
                       await connectWallet();
                     } catch {
                       setError("Failed to connect wallet. Is Freighter installed?");
                       return;
                     }
                     return;
                   }
                   setActionLoading(id);
                   try {
                     await acceptJob(wallet, String(id));
                     await refresh();
                   } catch (e) {
                     setError(e instanceof Error ? e.message : "Failed to accept job.");
                   } finally {
                     setActionLoading(null);
                   }
                 }}
                 disabled={actionLoading === id}
                 aria-busy={actionLoading === id}
               >
                 {actionLoading === id ? "Processing..." : "Accept Job"}
               </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
