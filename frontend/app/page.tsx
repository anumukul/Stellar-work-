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
  const [page, setPage] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const JOBS_PER_PAGE = 10;

  const refresh = async (resetPage = true) => {
    setLoading(true);
    setError(null);
    try {
      const count = await getJobCount();
      setTotalJobs(count);

      const currentPage = resetPage ? 1 : page;
      if (resetPage) setPage(1);

      const endId = Math.max(1, count - (currentPage - 1) * JOBS_PER_PAGE);
      const startId = Math.max(1, endId - JOBS_PER_PAGE + 1);

      // Fetch jobs in parallel for the current "page"
      const idsToFetch = Array.from(
        { length: endId - startId + 1 },
        (_, i) => String(startId + i)
      ).reverse(); // Show newest first

      const results = await Promise.all(
        idsToFetch.map(async (id) => {
          try {
            const job = await getJob(id);
            return job ? { id: Number(id), job } : null;
          } catch {
            return null;
          }
        })
      );

      const fetched = results.filter((r): r is { id: number; job: Job } => r !== null && r.job.status === "Open");

      if (resetPage) {
        setJobs(fetched);
      } else {
        setJobs(prev => [...prev, ...fetched]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch jobs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    // Note: We need to call refresh with the new page, but useEffect [page] would be cleaner
    // However, refresh currently handles its own logic.
  };

  useEffect(() => {
    if (page > 1) {
      void refresh(false);
    }
  }, [page]);

  function getDescription(hash: string): string {
    const stored = localStorage.getItem(`job-desc:${hash}`);
    if (stored) return stored;
    return "Description unavailable (posted from another device)";
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Open Jobs</h1>
        <button
          onClick={() => refresh(true)}
          className="text-sm text-blue-600 hover:underline disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-700 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">×</button>
        </div>
      )}

      {loading && jobs.length === 0 && <p role="status" aria-live="polite" className="text-sm text-slate-600">Loading jobs...</p>}

      {!loading && jobs.length === 0 && !error && (
        <p className="text-sm text-slate-600">No open jobs found.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map(({ id, job }) => (
          <article key={id} className="rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md">
            <Link href={`/job/${id}`} className="block">
              <h2 className="text-lg font-medium hover:underline">Job #{id}</h2>
            </Link>
            <p className="mt-2 text-sm text-slate-700 font-bold">{toXlm(job.amount)} XLM</p>
            <p className="mt-1 text-sm text-slate-700 line-clamp-2">
              {getDescription(job.description_hash)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Hash: {job.description_hash.slice(0, 12)}...
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Deadline: {job.deadline === "0" ? "No deadline" : new Date(Number(job.deadline) * 1000).toLocaleString()}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Link
                href={`/job/${id}`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                View Details
              </Link>
              <button
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${actionLoading === id
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
                  }`}
                onClick={async () => {
                  setError(null);
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
                    // Refresh current jobs to show it's gone
                    await refresh(true);
                  } catch (e) {
                    console.error("Accept job error:", e);
                    setError(e instanceof Error ? e.message : "Failed to accept job. Check your balance or contract state.");
                  } finally {
                    setActionLoading(null);
                  }
                }}
                disabled={actionLoading !== null}
                aria-busy={actionLoading === id}
              >
                {actionLoading === id ? "Processing..." : "Accept Job"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {jobs.length > 0 && jobs.length < totalJobs && (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-md border border-slate-300 bg-white px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </section>
  );
}
