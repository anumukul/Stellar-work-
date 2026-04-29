"use client";

import {
  approveWork,
  cancelJob,
  getJob,
  getJobCount,
  submitWork,
  enforceDeadline,
} from "@/lib/contract";
import EmptyState from "@/components/EmptyState";
import ErrorBanner from "@/components/ErrorBanner";
import SectionCard from "@/components/SectionCard";
import { useWallet } from "@/lib/wallet-context";
import type { Job, JobStatus } from "@/lib/types";
import { useEffect, useState, useCallback } from "react";

const STATUS_OPTIONS: JobStatus[] = [
  "Open",
  "InProgress",
  "SubmittedForReview",
  "Completed",
  "Cancelled",
];

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

function toXlm(stroops: string) {
  return (Number(stroops) / 10_000_000).toFixed(2);
}

function formatDeadline(deadline: string) {
  if (deadline === "0") return "No deadline";
  return new Date(Number(deadline) * 1000).toLocaleDateString();
}

export default function DashboardPage() {
  const { wallet, connectWallet } = useWallet();
  const [allJobs, setAllJobs] = useState<Array<{ id: number; job: Job }>>([]);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "All">("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const count = await getJobCount();
      const fetched: Array<{ id: number; job: Job }> = [];
      for (let id = 1; id <= count; id += 1) {
        const job = await getJob(String(id));
        if (job && (job.client === wallet || job.freelancer === wallet)) {
          fetched.push({ id, job });
        }
      }
      setAllJobs(fetched);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch jobs.");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleAction = async (fn: () => Promise<unknown>, jobId: number) => {
    setActionLoading(jobId);
    try {
      await fn();
      await fetchJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const postedJobs = allJobs.filter((j) => j.job.client === wallet);
  const acceptedJobs = allJobs.filter((j) => j.job.freelancer === wallet);

  const filterJobs = (jobs: Array<{ id: number; job: Job }>) => {
    if (statusFilter === "All") return jobs;
    return jobs.filter((j) => j.job.status === statusFilter);
  };

  const filteredPosted = filterJobs(postedJobs);
  const filteredAccepted = filterJobs(acceptedJobs);

  if (!wallet) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <SectionCard className="p-8 text-center">
          <p className="text-slate-600">Connect your wallet to view your jobs.</p>
          <button
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            onClick={async () => {
              try { await connectWallet(); } catch { /* cancelled */ }
            }}
          >
            Connect Wallet
          </button>
        </SectionCard>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-full px-3 py-1 text-sm ${statusFilter === "All" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"}`}
          onClick={() => setStatusFilter("All")}
        >
          All
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            className={`rounded-full px-3 py-1 text-sm ${statusFilter === s ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"}`}
            onClick={() => setStatusFilter(s)}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {loading && <p className="text-sm text-slate-600">Loading jobs...</p>}

      {!loading && (
        <>
          <JobSection
            title="Posted Jobs"
            subtitle="Jobs you created as a client"
            jobs={filteredPosted}
            wallet={wallet}
            role="client"
            actionLoading={actionLoading}
            onAction={handleAction}
          />
          <JobSection
            title="Accepted Jobs"
            subtitle="Jobs you accepted as a freelancer"
            jobs={filteredAccepted}
            wallet={wallet}
            role="freelancer"
            actionLoading={actionLoading}
            onAction={handleAction}
          />
        </>
      )}
    </section>
  );
}

function JobSection({
  title,
  subtitle,
  jobs,
  wallet,
  role,
  actionLoading,
  onAction,
}: {
  title: string;
  subtitle: string;
  jobs: Array<{ id: number; job: Job }>;
  wallet: string;
  role: "client" | "freelancer";
  actionLoading: number | null;
  onAction: (fn: () => Promise<unknown>, jobId: number) => Promise<void>;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-slate-500">{subtitle}</p>
      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs found"
          description="Try changing the status filter or check back after creating/accepting jobs."
        />
      ) : (
        <ul className="grid list-none gap-4 sm:grid-cols-2" aria-label={title}>
          {jobs.map(({ id, job }) => (
            <li key={id}>
              <JobCard
                id={id}
                job={job}
                wallet={wallet}
                role={role}
                isLoading={actionLoading === id}
                onAction={onAction}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JobCard({
  id,
  job,
  wallet,
  role,
  isLoading,
  onAction,
}: {
  id: number;
  job: Job;
  wallet: string;
  role: "client" | "freelancer";
  isLoading: boolean;
  onAction: (fn: () => Promise<unknown>, jobId: number) => Promise<void>;
}) {
  const actions = getActions(id, job, wallet, role);

  return (
    <article className="h-full rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">Job #{id}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status]}`}
        >
          {STATUS_LABELS[job.status]}
        </span>
      </div>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        <p>{toXlm(job.amount)} XLM</p>
        <p>Deadline: {formatDeadline(job.deadline)}</p>
        {role === "client" && job.freelancer && (
          <p className="truncate">Freelancer: {job.freelancer}</p>
        )}
        {role === "freelancer" && (
          <p className="truncate">Client: {job.client}</p>
        )}
      </div>
      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              disabled={isLoading}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => onAction(() => action.fn(), id)}
            >
              {isLoading ? "..." : action.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function getActions(
  id: number,
  job: Job,
  wallet: string,
  role: "client" | "freelancer",
): Array<{ label: string; fn: () => Promise<unknown> }> {
  const actions: Array<{ label: string; fn: () => Promise<unknown> }> = [];
  const jobId = String(id);

  if (role === "client") {
    if (job.status === "Open") {
      actions.push({ label: "Cancel Job", fn: () => cancelJob(wallet, jobId) });
    }
    if (job.status === "SubmittedForReview") {
      actions.push({ label: "Approve Work", fn: () => approveWork(wallet, jobId) });
    }
    if (job.status === "InProgress" && job.deadline !== "0") {
      actions.push({ label: "Enforce Deadline", fn: () => enforceDeadline(wallet, jobId) });
    }
  }

  if (role === "freelancer") {
    if (job.status === "InProgress") {
      actions.push({ label: "Submit Work", fn: () => submitWork(wallet, jobId) });
    }
  }

  return actions;
}
