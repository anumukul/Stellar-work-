"use client";

import { acceptJob, approveWork, cancelJob, getJob, submitWork } from "@/lib/contract";
import { useWallet } from "@/lib/wallet-context";
import type { Job } from "@/lib/types";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { wallet, connectWallet } = useWallet();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setJob(await getJob(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load job.");
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

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Job #{id}</h1>

      {error && <p role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</p>}
      {statusMsg && <p role="status" aria-live="polite" className="rounded-md bg-green-100 p-3 text-sm text-green-700">{statusMsg}</p>}

      {!job && !error && <p role="status" aria-live="polite" className="text-sm text-slate-600">Loading...</p>}
      {job && (
        <article className="rounded-lg border border-slate-200 bg-white p-5 text-sm">
          <p><strong>Status:</strong> {job.status}</p>
          <p><strong>Client:</strong> {job.client}</p>
          <p><strong>Freelancer:</strong> {job.freelancer ?? "Not assigned"}</p>
          <p><strong>Amount:</strong> {job.amount} stroops</p>
          <p><strong>Description:</strong> {getDescription(job.description_hash)}</p>
          <p className="text-xs text-slate-500"><strong>Hash:</strong> {job.description_hash}</p>
          <p><strong>Deadline:</strong> {job.deadline === "0" ? "No deadline" : new Date(Number(job.deadline) * 1000).toLocaleString()}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {wallet && job.status === "Open" && (
               <button
                 className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50"
                 onClick={() => handleAction(() => acceptJob(wallet, id))}
                 disabled={loading}
                 aria-busy={loading}
               >
                 {loading ? "Processing..." : "Accept Job"}
               </button>
            )}

            {isFreelancer && job.status === "InProgress" && (
               <button
                 className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50"
                 onClick={() => handleAction(() => submitWork(wallet, id))}
                 disabled={loading}
                 aria-busy={loading}
               >
                 {loading ? "Processing..." : "Submit Work"}
               </button>
            )}

            {isClient && job.status === "SubmittedForReview" && (
               <button
                 className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50"
                 onClick={() => handleAction(() => approveWork(wallet, id))}
                 disabled={loading}
                 aria-busy={loading}
               >
                 {loading ? "Processing..." : "Approve Work"}
               </button>
            )}

            {isClient && job.status === "Open" && (
               <button
                 className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50"
                 onClick={() => handleAction(() => cancelJob(wallet, id))}
                 disabled={loading}
                 aria-busy={loading}
               >
                 {loading ? "Processing..." : "Cancel Job"}
               </button>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
