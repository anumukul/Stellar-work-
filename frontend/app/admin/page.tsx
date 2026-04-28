"use client";

import {
  getFees,
  getJob,
  getJobCount,
  getNativeToken,
  withdrawFees,
} from "@/lib/contract";
import ErrorBanner from "@/components/ErrorBanner";
import { useWallet } from "@/lib/wallet-context";
import type { Job, JobStatus } from "@/lib/types";
import { useEffect, useState, useCallback } from "react";

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

function toXlm(stroops: number) {
  return (stroops / 10_000_000).toFixed(7);
}

export default function AdminPage() {
  const { wallet, connectWallet } = useWallet();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [fees, setFees] = useState<number>(0);
  const [nativeToken, setNativeToken] = useState<string>("");
  const [jobs, setJobs] = useState<Array<{ id: number; job: Job }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchAdminData = useCallback(async (walletAddress: string) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const token = await getNativeToken();
      setNativeToken(token);

      const accrued = await getFees(token);
      setFees(accrued);

      const count = await getJobCount();
      const fetched: Array<{ id: number; job: Job }> = [];
      for (let id = 1; id <= count; id += 1) {
        const job = await getJob(String(id));
        if (job) fetched.push({ id, job });
      }
      setJobs(fetched);

      const envAdmin = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
      if (envAdmin) {
        setIsAdmin(walletAddress === envAdmin);
      } else {
        setIsAdmin(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data.");
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (wallet) {
      fetchAdminData(wallet);
    } else {
      setLoading(false);
    }
  }, [wallet, fetchAdminData]);

  const handleWithdraw = async () => {
    if (!nativeToken) return;
    setWithdrawing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await withdrawFees(nativeToken);
      setSuccessMessage(`Successfully withdrew ${toXlm(fees)} XLM in fees.`);
      setFees(0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Withdraw failed.";
      if (msg.includes("Unauthorized") || msg.includes("#2")) {
        setIsAdmin(false);
        setError("Unauthorized: your wallet is not the contract admin.");
      } else {
        setError(msg);
      }
    } finally {
      setWithdrawing(false);
    }
  };

  if (!wallet) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-600">Connect your wallet to access admin controls.</p>
          <button
            className="mt-4 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
            onClick={async () => {
              try { await connectWallet(); } catch { /* cancelled */ }
            }}
          >
            Connect Wallet
          </button>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <p className="text-sm text-slate-600">Loading admin data...</p>
      </section>
    );
  }

  if (isAdmin === false) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-800">Unauthorized</p>
          <p className="mt-1 text-sm text-red-600">
            Your wallet ({wallet.slice(0, 6)}...{wallet.slice(-4)}) is not the
            contract admin.
          </p>
        </div>
      </section>
    );
  }

  const statusCounts = jobs.reduce<Record<string, number>>((acc, { job }) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin Panel</h1>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {successMessage && (
        <p className="rounded-md bg-green-100 p-3 text-sm text-green-700">
          {successMessage}
        </p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Platform Fees</h2>
        <p className="mt-2 text-3xl font-bold">{toXlm(fees)} XLM</p>
        <p className="text-sm text-slate-500">Accrued platform fees (2.5%)</p>
        <button
          disabled={withdrawing || fees <= 0}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={handleWithdraw}
        >
          {withdrawing ? "Withdrawing..." : "Withdraw Fees"}
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Job Overview</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          <div className="rounded-md border border-slate-200 p-3 text-center">
            <p className="text-2xl font-bold">{jobs.length}</p>
            <p className="text-xs text-slate-500">Total</p>
          </div>
          {(Object.keys(STATUS_LABELS) as JobStatus[]).map((status) => (
            <div
              key={status}
              className="rounded-md border border-slate-200 p-3 text-center"
            >
              <p className="text-2xl font-bold">{statusCounts[status] || 0}</p>
              <p className="text-xs text-slate-500">{STATUS_LABELS[status]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">All Jobs</h2>
        {jobs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No jobs found on-chain.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Client</th>
                  <th className="pb-2 pr-4">Freelancer</th>
                  <th className="pb-2 pr-4 text-right">Amount</th>
                  <th className="pb-2 pr-4">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(({ id, job }) => (
                  <tr key={id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium">#{id}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status]}`}
                      >
                        {STATUS_LABELS[job.status]}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {job.client.slice(0, 8)}...
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {job.freelancer ? `${job.freelancer.slice(0, 8)}...` : "-"}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {(Number(job.amount) / 10_000_000).toFixed(2)} XLM
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {job.deadline === "0"
                        ? "None"
                        : new Date(
                            Number(job.deadline) * 1000,
                          ).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
