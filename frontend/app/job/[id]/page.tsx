"use client";

import LoadingState from "@/components/LoadingState";
import { acceptJob, approveWork, cancelJob, getJob, submitWork } from "@/lib/contract";
import { toXlm } from "@/lib/format";
import { getExplorerTxUrl } from "@/lib/stellar";
import type { Job } from "@/lib/types";
import { useWallet } from "@/lib/wallet-context";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { wallet } = useWallet();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [lastAnnouncedSuccess, setLastAnnouncedSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [latestTxHash, setLatestTxHash] = useState<string | null>(null);

  async function load() {
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
  }

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

  async function handleAction(action: () => Promise<{ hash?: string }>) {
    setError(null);
    setStatusMsg(null);
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
      await load();
      const nextSuccess = "Action completed successfully.";
      setStatusMsg(nextSuccess);
      if (nextSuccess !== lastAnnouncedSuccess) {
        setLastAnnouncedSuccess(nextSuccess);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <div className="py-16">
        <LoadingState
          text="Loading job details..."
          className="mx-auto flex w-fit items-center gap-2 text-sm text-slate-700"
        />
      </div>
    );
  }

  if (!job) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Job #{id}</h1>
        <p className="text-sm text-slate-700">{error ?? "Job not found."}</p>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          Back to Home
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          Back
        </Link>
        <h1 className="text-2xl font-semibold">Job #{id}</h1>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {statusMsg && (
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="rounded-md bg-green-100 p-3 text-sm text-green-700"
        >
          {statusMsg}
        </p>
      )}
      {latestTxHash && (
        <p className="text-sm text-slate-700">
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

      <article className="space-y-2 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <p>
          <strong>Status:</strong> {job.status}
        </p>
        <p>
          <strong>Client:</strong> {job.client}
        </p>
        <p>
          <strong>Freelancer:</strong> {job.freelancer ?? "Not assigned"}
        </p>
        <p>
          <strong>Amount:</strong> {toXlm(job.amount)} XLM
        </p>
        <p>
          <strong>Description:</strong> {getDescription(job.description_hash)}
        </p>
        <p>
          <strong>Description hash:</strong> {job.description_hash}
        </p>
        <p>
          <strong>Deadline:</strong>{" "}
          {job.deadline === "0" ? "No deadline" : new Date(Number(job.deadline) * 1000).toLocaleString()}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {job.status === "Open" && (
            <button
              className="rounded-md border border-slate-300 px-3 py-1.5"
              onClick={() => {
                if (!wallet) {
                  return;
                }
                void handleAction(() => acceptJob(wallet, id));
              }}
              disabled={!wallet || loading}
              title={!wallet ? "Connect your wallet to accept this job." : undefined}
              aria-busy={loading}
            >
              {loading ? "Processing..." : "Accept Job"}
            </button>
          )}

          {isFreelancer && job.status === "InProgress" && (
            <button
              className="rounded-md border border-slate-300 px-3 py-1.5"
              onClick={() => handleAction(() => submitWork(wallet, id))}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "Processing..." : "Submit Work"}
            </button>
          )}

          {isClient && job.status === "SubmittedForReview" && (
            <button
              className="rounded-md border border-slate-300 px-3 py-1.5"
              onClick={() => handleAction(() => approveWork(wallet, id))}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "Processing..." : "Approve Work"}
            </button>
          )}

          {isClient && job.status === "Open" && (
            <button
              className="rounded-md border border-slate-300 px-3 py-1.5"
              onClick={() => handleAction(() => cancelJob(wallet, id))}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "Processing..." : "Cancel Job"}
            </button>
          )}
        </div>
        {!wallet && (
          <p className="text-xs text-amber-700">
            Connect your wallet to enable contract actions.
          </p>
        )}
      </article>
    </section>
  );
}
