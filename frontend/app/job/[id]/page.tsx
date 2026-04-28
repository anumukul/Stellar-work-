"use client";

import { acceptJob, approveWork, cancelJob, getJob, submitWork } from "@/lib/contract";
import { toXlm } from "@/lib/format";
import { useWallet } from "@/lib/wallet-context";
import type { Job } from "@/lib/types";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { wallet, connectWallet } = useWallet();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const load = async () => {
    setFetching(true);
    setError(null);
    try {
      const data = await getJob(id);
      setJob(data);
      if (!data) {
        setError("Job not found.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load job.");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isClient = wallet && job && wallet === job.client;
  const isFreelancer = wallet && job && wallet === job.freelancer;

  function getDescription(hash: string): string {
    const stored = localStorage.getItem(`job-desc:${hash}`);
    if (stored) return stored;
    return "Description unavailable (posted from another device)";
  }

  async function handleAction(action: () => Promise<unknown>) {
    setError(null);
    setStatusMsg(null);
    setLoading(true);
    if (!wallet) {
      try {
        await connectWallet();
      } catch {
        setError("Failed to connect wallet. Is Freighter installed?");
        setLoading(false);
      }
      return;
    }
    try {
      await action();
      await load();
      setStatusMsg("Action completed successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        <p className="text-slate-600 animate-pulse">Loading job details...</p>
      </div>
    );
  }

  if (!job && error === "Job not found.") {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Job Not Found</h1>
        <p className="mt-2 text-slate-600">The job with ID #{id} doesn't exist or has been removed.</p>
        <div className="mt-6">
          <Link href="/" className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-red-900">Error Loading Job</h1>
        <p className="mt-2 text-red-700">{error}</p>
        <div className="mt-6 flex justify-center gap-4">
          <button onClick={() => load()} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Retry
          </button>
          <Link href="/" className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </Link>
        <h1 className="text-2xl font-semibold">Job #{id}</h1>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</p>}
      {statusMsg && <p role="status" aria-live="polite" className="rounded-md bg-green-100 p-3 text-sm text-green-700">{statusMsg}</p>}

      {job && (
        <article className="rounded-lg border border-slate-200 bg-white p-5 text-sm">
          <p><strong>Status:</strong> {job.status}</p>
          <p><strong>Client:</strong> {job.client}</p>
          <p><strong>Freelancer:</strong> {job.freelancer ?? "Not assigned"}</p>
          <p><strong>Amount:</strong> {toXlm(job.amount)} XLM</p>
          <p><strong>Description hash:</strong> {job.description_hash}</p>
          <p><strong>Deadline:</strong> {job.deadline === "0" ? "No deadline" : new Date(Number(job.deadline) * 1000).toLocaleString()}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {wallet && job.status === "Open" && (
              <button
                className="rounded-md border border-slate-300 px-3 py-1.5"
                onClick={async () => {
                  await acceptJob(wallet, id);
                  await load();
                }}
              >
                Accept Job
              </button>
            )}

            {isFreelancer && job.status === "InProgress" && (
              <button
                className="rounded-md border border-slate-300 px-3 py-1.5"
                onClick={async () => {
                  await submitWork(wallet, id);
                  await load();
                }}
              >
                Submit Work
              </button>
            )}

            {isClient && job.status === "SubmittedForReview" && (
              <button
                className="rounded-md border border-slate-300 px-3 py-1.5"
                onClick={async () => {
                  await approveWork(wallet, id);
                  await load();
                }}
              >
                Approve Work
              </button>
            )}

            {isClient && job.status === "Open" && (
              <button
                className="rounded-md border border-slate-300 px-3 py-1.5"
                onClick={async () => {
                  await cancelJob(wallet, id);
                  await load();
                }}
              >
                Cancel Job
              </button>
            )}
        <article className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden text-sm">
          <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${job.status === "Open" ? "bg-green-100 text-green-700" :
                  job.status === "InProgress" ? "bg-blue-100 text-blue-700" :
                    job.status === "SubmittedForReview" ? "bg-purple-100 text-purple-700" :
                      "bg-slate-100 text-slate-700"
                }`}>
                {job.status}
              </span>
              <span className="font-bold text-slate-900 text-base">{job.amount} stroops</span>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Description</h3>
              <p className="mt-1 text-slate-700 text-base leading-relaxed">{getDescription(job.description_hash)}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Client</h3>
                <p className="mt-1 font-mono text-xs text-slate-600 truncate bg-slate-50 p-1.5 rounded">{job.client}</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Freelancer</h3>
                <p className="mt-1 font-mono text-xs text-slate-600 truncate bg-slate-50 p-1.5 rounded">{job.freelancer ?? "Not assigned"}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Deadline</h3>
                <p className="mt-1 text-slate-700 font-medium">
                  {job.deadline === "0" ? "No deadline" : new Date(Number(job.deadline) * 1000).toLocaleString()}
                </p>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Description Hash</h3>
                <p className="mt-1 font-mono text-[10px] text-slate-400">{job.description_hash}</p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 pt-6 border-t border-slate-100">
              {wallet && job.status === "Open" && (
                <button
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                  onClick={() => handleAction(() => acceptJob(wallet, id))}
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? "Processing..." : "Accept Job"}
                </button>
              )}

              {isFreelancer && job.status === "InProgress" && (
                <button
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                  onClick={() => handleAction(() => submitWork(wallet, id))}
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? "Processing..." : "Submit Work"}
                </button>
              )}

              {isClient && job.status === "SubmittedForReview" && (
                <button
                  className="rounded-md bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
                  onClick={() => handleAction(() => approveWork(wallet, id))}
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? "Processing..." : "Approve Work"}
                </button>
              )}

              {isClient && job.status === "Open" && (
                <button
                  className="rounded-md border border-red-200 bg-red-50 px-6 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                  onClick={() => handleAction(() => cancelJob(wallet, id))}
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? "Processing..." : "Cancel Job"}
                </button>
              )}
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
