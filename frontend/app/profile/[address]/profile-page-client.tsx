"use client";

import ErrorBanner from "@/components/ErrorBanner";
import { getJob, getJobCount } from "@/lib/contract";
import type { Job, JobStatus } from "@/lib/types";
import { useWallet } from "@/lib/wallet-context";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const STATUS_LABELS: Record<JobStatus, string> = {
  Open: "Open",
  InProgress: "In Progress",
  SubmittedForReview: "Submitted for Review",
  Completed: "Completed",
  Cancelled: "Cancelled",
  Disputed: "Disputed",
};

const STATUS_COLORS: Record<JobStatus, string> = {
  Open: "bg-blue-100 text-blue-800",
  InProgress: "bg-yellow-100 text-yellow-800",
  SubmittedForReview: "bg-purple-100 text-purple-800",
  Completed: "bg-green-100 text-green-800",
  Cancelled: "bg-red-100 text-red-800",
  Disputed: "bg-orange-100 text-orange-800",
};

function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}

function toXlm(stroops: number) {
  return (stroops / 10_000_000).toFixed(2);
}

interface ProfileJob {
  id: number;
  job: Job;
  role: "client" | "freelancer";
}

export default function ProfilePageClient({ address }: { address: string }) {
  const { wallet, connectWallet } = useWallet();

  const [jobs, setJobs] = useState<ProfileJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addressValid = isValidStellarAddress(address);

  const fetchJobs = useCallback(async () => {
    if (!wallet || !addressValid) return;
    setLoading(true);
    setError(null);
    try {
      const count = await getJobCount();
      const fetched: ProfileJob[] = [];
      for (let id = 1; id <= count; id += 1) {
        const job = await getJob(String(id));
        if (!job) continue;
        if (job.client === address) {
          fetched.push({ id, job, role: "client" });
        } else if (job.freelancer === address) {
          fetched.push({ id, job, role: "freelancer" });
        }
      }
      setJobs(fetched);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch job history.");
    } finally {
      setLoading(false);
    }
  }, [wallet, address, addressValid]);

  useEffect(() => {
    if (wallet) {
      fetchJobs();
    } else {
      setJobs([]);
      setLoading(false);
      setError(null);
    }
  }, [wallet, fetchJobs]);

  const jobsPosted = jobs.filter((j) => j.role === "client").length;
  const jobsCompleted = jobs.filter((j) => j.job.status === "Completed").length;
  const totalEarnedStroops = jobs
    .filter((j) => j.role === "freelancer" && j.job.status === "Completed")
    .reduce((sum, j) => sum + Number(j.job.amount) * 0.975, 0);
  const totalSpentStroops = jobs
    .filter((j) => j.role === "client" && j.job.status === "Completed")
    .reduce((sum, j) => sum + Number(j.job.amount), 0);

  if (!addressValid) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-800">Invalid Address</p>
          <p className="mt-1 text-sm text-red-600">
            &ldquo;{address}&rdquo; is not a valid Stellar address.
          </p>
        </div>
      </section>
    );
  }

  if (!wallet) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-600">Connect your wallet to view this profile.</p>
          <button
            className="mt-4 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
            onClick={async () => {
              try {
                await connectWallet();
              } catch {
                // user cancelled wallet connect flow
              }
            }}
          >
            Connect Wallet
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 font-mono text-sm text-slate-500">{address}</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {loading && <p className="text-sm text-slate-600">Loading job history...</p>}

      {!loading && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold">{jobsPosted}</p>
              <p className="text-xs text-slate-500">Jobs Posted</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold">{jobsCompleted}</p>
              <p className="text-xs text-slate-500">Jobs Completed</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold">{toXlm(totalEarnedStroops)}</p>
              <p className="text-xs text-slate-500">XLM Earned</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold">{toXlm(totalSpentStroops)}</p>
              <p className="text-xs text-slate-500">XLM Spent</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Job History</h2>
            {jobs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No jobs found for this address.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="pb-2 pr-4">ID</th>
                      <th className="pb-2 pr-4">Role</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4 text-right">Amount</th>
                      <th className="pb-2 pr-4">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(({ id, job, role }) => (
                      <tr key={`${id}-${role}`} className="border-b border-slate-100">
                        <td className="py-2 pr-4">
                          <Link href={`/job/${id}`} className="font-medium hover:underline">
                            #{id}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 capitalize">{role}</td>
                        <td className="py-2 pr-4">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status]}`}
                          >
                            {STATUS_LABELS[job.status]}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {toXlm(Number(job.amount))} XLM
                        </td>
                        <td className="py-2 pr-4 text-xs">
                          {new Date(Number(job.created_at) * 1000).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
