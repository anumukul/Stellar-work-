"use client";

import ErrorBanner from "@/components/ErrorBanner";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import SectionCard from "@/components/SectionCard";
import { acceptJob, getJob, getJobCount } from "@/lib/contract";
import { getExplorerTxUrl } from "@/lib/stellar";
import type { Job } from "@/lib/types";
import { useWallet } from "@/lib/wallet-context";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function toXlm(stroops: string) {
  return (Number(stroops) / 10_000_000).toFixed(2);
}

export default function HomePage() {
  const { wallet } = useWallet();
  const [jobs, setJobs] = useState<Array<{ id: number; job: Job }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalJobs, setTotalJobs] = useState(0);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalJobs / pageSize)),
    [pageSize, totalJobs],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const count = await getJobCount();
      setTotalJobs(count);

      if (count === 0) {
        setJobs([]);
        setLoading(false);
        return;
      }

      const maxPages = Math.max(1, Math.ceil(count / pageSize));
      const safePage = Math.min(Math.max(1, page), maxPages);
      if (safePage !== page) {
        setPage(safePage);
      }

      const endId = Math.max(1, count - (safePage - 1) * pageSize);
      const startId = Math.max(1, endId - pageSize + 1);

      const idsToFetch = Array.from(
        { length: endId - startId + 1 },
        (_, i) => String(startId + i),
      );
      if (sortOrder === "newest") {
        idsToFetch.reverse();
      }

      const results = await Promise.all(
        idsToFetch.map(async (id) => {
          try {
            const job = await getJob(id);
            return job ? { id: Number(id), job } : null;
          } catch {
            return null;
          }
        }),
      );

      const fetched = results.filter(
        (item): item is { id: number; job: Job } =>
          item !== null && item.job.status === "Open",
      );

      // Update jobs only after new data is ready to prevent flicker
      setJobs(fetched);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch jobs.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortOrder]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  async function handleAction(action: () => Promise<{ hash?: string }>) {
    if (loading) return;
    setError(null);
    setLatestTxHash(null);
    if (!wallet) {
      setError("Connect your wallet to run this action.");
      return;
    }

    setLoading(true);

    try {
      const result = await action();
      if (result.hash) {
        setLatestTxHash(result.hash);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHash(text);
      setTimeout(() => setCopiedHash(null), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  }

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
          type="button"
          onClick={() => void refresh()}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {loading && jobs.length === 0 && <LoadingState text="Loading jobs..." />}

      {loading && jobs.length > 0 && (
        <p role="status" aria-live="polite" className="text-xs text-slate-400">
          Refreshing jobs…
        </p>
      )}

      {latestTxHash && (
        <p className="text-sm text-slate-600">
          Last transaction:{" "}
          <a
            href={getExplorerTxUrl(latestTxHash)}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
          >
            {latestTxHash}
          </a>
        </p>
      )}

      {!loading && jobs.length === 0 && !error && (
        <EmptyState
          title="No open jobs found"
          description="New jobs will appear here as clients post them."
        />
      )}

      <SectionCard
        title="Jobs Display"
        description="Default sort is newest first."
      >
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <label htmlFor="jobs-sort-order">Sort:</label>
          <select
            id="jobs-sort-order"
            value={sortOrder}
            onChange={(event) => {
              setSortOrder(event.target.value as "newest" | "oldest");
              setPage(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1"
            disabled={loading}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </SectionCard>

      <ul
        className="grid list-none gap-4 md:grid-cols-2"
        aria-label="Open jobs"
      >
        {jobs.map(({ id, job }) => (
          <li key={id}>
            <article className="h-full rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md">
              <Link href={`/job/${id}`} className="block">
                <h2 className="text-lg font-medium hover:underline">Job #{id}</h2>
              </Link>
              <p className="mt-2 text-sm font-bold text-slate-700">{toXlm(job.amount)} XLM</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-700">
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
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  View Details
                </Link>
                <button
                  type="button"
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    !wallet || actionLoading === id
                      ? "cursor-not-allowed bg-slate-100 text-slate-400"
                      : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
                  }`}
                  title={!wallet ? "Connect your wallet to accept jobs." : undefined}
                  onClick={async () => {
                    setError(null);
                    if (!wallet) {
                      return;
                    }
                    setActionLoading(id);
                    try {
                      const result = await acceptJob(wallet, String(id));
                      if (result.hash) {
                        setLatestTxHash(result.hash);
                      }
                      await refresh();
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Failed to accept job. Check your balance or contract state.",
                      );
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                  disabled={!wallet || actionLoading !== null}
                  aria-busy={actionLoading === id}
                >
                  {actionLoading === id ? "Processing..." : "Accept Job"}
                </button>
              </div>
              {!wallet && (
                <p className="mt-2 text-xs text-amber-700">
                  Connect your wallet to enable job actions.
                </p>
              )}
            </article>
          </li>
        ))}
      </ul>

      {totalJobs > 0 && (
        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <label htmlFor="jobs-page-size">Page size:</label>
            <select
              id="jobs-page-size"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1"
              disabled={loading}
            >
              {[5, 10, 20].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={loading || page <= 1}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {Math.min(page, totalPages)} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={loading || page >= totalPages}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
