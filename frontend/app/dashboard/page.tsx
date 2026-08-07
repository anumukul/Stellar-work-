"use client";

import {
  approveWork,
  batchApproveJobs,
  cancelJob,
  freelancerCancelJob,
  getJob,
  getJobCount,
  getCompletedJobsCount,
  getJobStatusCounts,
  submitWork,
  enforceDeadline,
} from "@/lib/contract";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import ErrorBanner from "@/components/ErrorBanner";
import ExportButton from "@/components/ExportButton";
import InfoTooltip from "@/components/InfoTooltip";
import JobCardSkeleton from "@/components/JobCardSkeleton";
import NoResultsState from "@/components/NoResultsState";
import PullToRefresh from "@/components/PullToRefresh";
import SectionCard from "@/components/SectionCard";
import StatusPill from "@/components/StatusPill";
import TruncatedAddress from "@/components/TruncatedAddress";
import { useToast } from "@/components/ToastProvider";
import RecentContractInteractionsWidget from "@/app/dashboard/RecentContractInteractionsWidget";
import DashboardWidgets from "@/components/DashboardWidgets";
import { useNotifications, getEventLabel } from "@/lib/notifications-context";
import { formatDeadline, toXlm } from "@/lib/format";
import { isConfirmSuppressed, CONFIRM_KEYS } from "@/lib/confirm-prefs";
import { useWallet } from "@/lib/wallet-context";
import type { Job, JobStatus, NotificationEvent, JobStatusCounts } from "@/lib/types";
import { STATUS_TO_COUNTS_KEY } from "@/lib/types";
import { useEffect, useState, useCallback, useRef, type KeyboardEvent } from "react";

type PendingDashAction = {
  type: "cancelJob" | "approveWork" | "submitWork" | "freelancerCancelJob" | "enforceDeadline";
  jobId: number;
  amountXlm: string;
};

const STATUS_OPTIONS: JobStatus[] = [
  "Open",
  "InProgress",
  "SubmittedForReview",
  "Completed",
  "Cancelled",
  "Disputed",
];

const EVENT_DOT: Record<string, string> = {
  job_accepted: "bg-blue-500",
  work_submitted: "bg-amber-500",
  work_approved: "bg-emerald-500",
  job_cancelled: "bg-slate-500",
  dispute_raised: "bg-red-500",
  dispute_resolved: "bg-violet-500",
};

const STATUS_LABELS: Record<JobStatus, string> = {
  Open: "Open",
  InProgress: "In Progress",
  SubmittedForReview: "Submitted for Review",
  Completed: "Completed",
  Cancelled: "Cancelled",
  Disputed: "Disputed",
};

const BOOKMARK_STORAGE_KEY = "stellarwork:bookmarked-jobs";

function loadBookmarkedIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(BOOKMARK_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => Number(entry))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

export default function DashboardPage() {
  const { wallet, connectWallet } = useWallet();
  const { showSuccess, showError } = useToast();
  const { notifications, addNotification } = useNotifications();
  const [allJobs, setAllJobs] = useState<Array<{ id: number; job: Job }>>([]);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "All">("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingDashAction | null>(null);
  const [completedJobsCount, setCompletedJobsCount] = useState<number | null>(null);
  const [statusCounts, setStatusCounts] = useState<JobStatusCounts>({
    open: 0,
    in_progress: 0,
    submitted_for_review: 0,
    completed: 0,
    cancelled: 0,
    disputed: 0,
    total: 0,
  });
  const [selectedJobs, setSelectedJobs] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [bookmarkedJobs, setBookmarkedJobs] = useState<Array<{ id: number; job: Job }>>([]);
  const [bookmarkedLoading, setBookmarkedLoading] = useState(false);
  // Issue #453 — Bulk job cancellation
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkCancelProgress, setBulkCancelProgress] = useState<{ done: number; total: number; failed: number[] } | null>(null);
  const bookmarkedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const filterOptions: Array<JobStatus | "All"> = ["All", ...STATUS_OPTIONS];
  const filterButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

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
      try {
        const completed = await getCompletedJobsCount();
        setCompletedJobsCount(completed);
      } catch {
        setCompletedJobsCount(null);
      }
      try {
        const counts = await getJobStatusCounts();
        setStatusCounts(counts);
      } catch {
        // Silently ignore — status breakdown is non-critical
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch jobs.");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    if (wallet) {
      fetchJobs();
    } else {
      setAllJobs([]);
      setBookmarkedJobs([]);
      setCompletedJobsCount(null);
      setStatusCounts({ open: 0, in_progress: 0, submitted_for_review: 0, completed: 0, cancelled: 0, disputed: 0, total: 0 });
      setLoading(false);
      setError(null);
    }
  }, [wallet, fetchJobs]);

  useEffect(() => {
    if (!wallet) return;

    const fetchBookmarked = async () => {
      const ids = loadBookmarkedIds();
      if (ids.length === 0) {
        setBookmarkedJobs([]);
        return;
      }
      setBookmarkedLoading(true);
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const job = await getJob(String(id));
              return job ? { id, job } : null;
            } catch {
              return null;
            }
          }),
        );
        setBookmarkedJobs(
          results.filter(
            (item): item is { id: number; job: Job } => item !== null,
          ),
        );
      } catch {
        setBookmarkedJobs([]);
      } finally {
        setBookmarkedLoading(false);
      }
    };

    fetchBookmarked();

    bookmarkedIntervalRef.current = setInterval(fetchBookmarked, 30000);
    return () => {
      if (bookmarkedIntervalRef.current) {
        clearInterval(bookmarkedIntervalRef.current);
      }
    };
  }, [wallet]);

  const handleAction = async (
    fn: () => Promise<unknown>,
    jobId: number,
    notification?: { event: NotificationEvent; message: string },
  ) => {
    setActionLoading(jobId);
    setError(null);
    try {
      await fn();
      if (notification) {
        addNotification(notification.event, jobId, notification.message);
      }
      await fetchJobs();
      setError(null);
      showSuccess("Action completed successfully.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Action failed.";
      setError(message);
      showError(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBatchApprove = async () => {
    if (!wallet || selectedJobs.size === 0) return;
    setBatchLoading(true);
    setError(null);
    try {
      const jobIds = Array.from(selectedJobs).map(String);
      await batchApproveJobs(wallet, jobIds);
      showSuccess(`${jobIds.length} job(s) approved.`);
      setSelectedJobs(new Set());
      await fetchJobs();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Batch approval failed.";
      setError(message);
      showError(message);
    } finally {
      setBatchLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!wallet || pendingAction === null) return;
    const jobId = pendingAction.jobId;
    const type = pendingAction.type;
    setPendingAction(null);
    if (type === "cancelJob") {
      await handleAction(
        () => cancelJob(wallet, String(jobId)),
        jobId,
        { event: "job_cancelled", message: `Job #${jobId} was cancelled and funds refunded.` },
      );
    } else if (type === "approveWork") {
      await handleAction(
        () => approveWork(wallet, String(jobId)),
        jobId,
        { event: "work_approved", message: `Work for Job #${jobId} was approved and payment released.` },
      );
    } else if (type === "submitWork") {
      await handleAction(
        () => submitWork(wallet, String(jobId)),
        jobId,
        { event: "work_submitted", message: `Work for Job #${jobId} was submitted for review.` },
      );
    } else if (type === "freelancerCancelJob") {
      await handleAction(
        () => freelancerCancelJob(wallet, String(jobId)),
        jobId,
        undefined
      );
    } else if (type === "enforceDeadline") {
      await handleAction(
        () => enforceDeadline(wallet, String(jobId)),
        jobId,
        undefined
      );
    }
  };

  /** Request a confirmed action. Skips the dialog if the user previously chose "Don't show again". */
  const requestDashAction = useCallback((
    type: PendingDashAction["type"],
    jobId: number,
    amountXlm: string,
  ) => {
    const keyMap: Record<PendingDashAction["type"], string> = {
      cancelJob: CONFIRM_KEYS.cancelJob,
      approveWork: CONFIRM_KEYS.approveWork,
      submitWork: CONFIRM_KEYS.submitWork,
      freelancerCancelJob: CONFIRM_KEYS.freelancerCancelJob,
      enforceDeadline: CONFIRM_KEYS.enforceDeadline,
    };
    if (isConfirmSuppressed(keyMap[type])) {
      // Execute directly without dialog
      const pending: PendingDashAction = { type, jobId, amountXlm };
      setPendingAction(pending);
      // Trigger confirm immediately by calling handleConfirmCancel after state flush
      // We do this via a synthetic pending that handleConfirmCancel reads
      void (async () => {
        if (!wallet) return;
        if (type === "cancelJob") {
          await handleAction(
            () => cancelJob(wallet, String(jobId)),
            jobId,
            { event: "job_cancelled", message: `Job #${jobId} was cancelled and funds refunded.` },
          );
        } else if (type === "approveWork") {
          await handleAction(
            () => approveWork(wallet, String(jobId)),
            jobId,
            { event: "work_approved", message: `Work for Job #${jobId} was approved and payment released.` },
          );
        } else if (type === "submitWork") {
          await handleAction(
            () => submitWork(wallet, String(jobId)),
            jobId,
            { event: "work_submitted", message: `Work for Job #${jobId} was submitted for review.` },
          );
        } else if (type === "freelancerCancelJob") {
          await handleAction(
            () => freelancerCancelJob(wallet, String(jobId)),
            jobId,
            undefined
          );
        } else if (type === "enforceDeadline") {
          await handleAction(
            () => enforceDeadline(wallet, String(jobId)),
            jobId,
            undefined
          );
        }
        setPendingAction(null);
      })();
    } else {
      setPendingAction({ type, jobId, amountXlm });
    }
  }, [wallet, handleAction]);

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllOpen = useCallback(() => {
    const openClientJobIds = allJobs
      .filter((j) => j.job.client === wallet && j.job.status === "Open")
      .map((j) => j.id);
    setSelectedJobIds(new Set(openClientJobIds));
  }, [allJobs, wallet]);

  const handleDeselectAll = useCallback(() => {
    setSelectedJobIds(new Set());
  }, []);

  const handleBulkCancel = useCallback(async () => {
    if (!wallet || selectedJobIds.size === 0) return;
    setShowBulkConfirm(false);
    const ids = Array.from(selectedJobIds);
    setBulkCancelProgress({ done: 0, total: ids.length, failed: [] });
    const failed: number[] = [];
    for (const id of ids) {
      try {
        await cancelJob(wallet, String(id));
      } catch {
        failed.push(id);
      }
      setBulkCancelProgress((prev) =>
        prev ? { ...prev, done: prev.done + 1, failed } : null,
      );
    }
    setBulkCancelProgress(null);
    setSelectedJobIds(new Set());
    await fetchJobs();
    if (failed.length === 0) {
      showSuccess(`${ids.length} job${ids.length > 1 ? "s" : ""} cancelled and funds refunded.`);
    } else {
      showError(`${ids.length - failed.length} cancelled; ${failed.length} failed (Job${failed.length > 1 ? "s" : ""} #${failed.join(", #")}).`);
    }
  }, [wallet, selectedJobIds, fetchJobs, showSuccess, showError]);

  const postedJobs = allJobs.filter((j) => j.job.client === wallet);
  const acceptedJobs = allJobs.filter((j) => j.job.freelancer === wallet);

  const filterJobs = (jobs: Array<{ id: number; job: Job }>) => {
    if (statusFilter === "All") return jobs;
    return jobs.filter((j) => j.job.status === statusFilter);
  };

  const filteredPosted = filterJobs(postedJobs);
  const filteredAccepted = filterJobs(acceptedJobs);

  const handleFilterKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex =
      (index + delta + filterOptions.length) % filterOptions.length;
    const nextFilter = filterOptions[nextIndex];
    setStatusFilter(nextFilter);
    filterButtonRefs.current[nextIndex]?.focus();
  };

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
    <DashboardWidgets>
    <section className="space-y-6">
      <PullToRefresh onRefresh={fetchJobs} label="Refresh dashboard" />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <ExportButton jobs={allJobs} wallet={wallet} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="interactive-card p-4">
          <p className="text-2xl font-bold tabular-nums">
            {completedJobsCount ?? "—"}
          </p>
          <p className="text-xs text-slate-500">Completed jobs (contract)</p>
        </div>
        <div className="interactive-card p-4">
          <p className="text-2xl font-bold tabular-nums">{allJobs.length}</p>
          <p className="text-xs text-slate-500">Your jobs on record</p>
        </div>
      </div>

      {/* Platform-wide status breakdown */}
      {statusCounts.total > 0 && (
        <SectionCard title="Platform Overview">
          <p className="mb-3 text-sm text-slate-500">Across all platform jobs</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-7">
            <div className="rounded-md border border-slate-200 p-3 text-center">
              <p className="text-xl font-bold tabular-nums">{statusCounts.total}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
            {(Object.keys(STATUS_LABELS) as JobStatus[]).map((status) => {
              const key = STATUS_TO_COUNTS_KEY[status];
              const count = statusCounts[key] ?? 0;
              return (
                <div
                  key={status}
                  className="rounded-md border border-slate-200 p-3 text-center"
                >
                  <p className="text-xl font-bold tabular-nums">{count}</p>
                  <p className="text-xs text-slate-500">{STATUS_LABELS[status]}</p>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
      <RecentContractInteractionsWidget />

      {/* Activity Feed */}
      {notifications.length > 0 && (
        <SectionCard className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
            <span className="text-xs text-slate-400">{notifications.length} event{notifications.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {notifications.slice(0, 10).map((n) => {
              const dot = EVENT_DOT[n.event] ?? "bg-slate-400";
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-5 py-3 ${n.seen ? "" : "bg-blue-50/50"}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">{n.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {getEventLabel(n.event)} &middot; {new Date(n.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <div
        className="flex flex-wrap gap-2"
        role="toolbar"
        aria-label="Filter jobs by status"
      >
        <div className="mr-1 flex items-center gap-2 text-sm text-slate-600">
          <span>Filter:</span>
          <InfoTooltip
            label="Filter jobs by status help"
            content="Use the status chips to narrow your job history. Arrow keys move between filters."
          />
        </div>
        {filterOptions.map((s, index) => (
          <button
            key={s}
            ref={(element) => {
              filterButtonRefs.current[index] = element;
            }}
            className={`rounded-full px-3 py-1 text-sm ${statusFilter === s ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"}`}
            onClick={() => setStatusFilter(s)}
            onKeyDown={(event) => handleFilterKeyDown(event, index)}
            aria-pressed={statusFilter === s}
            aria-label={`${s === "All" ? "All statuses" : STATUS_LABELS[s]} filter, ${
              statusFilter === s ? "selected" : "not selected"
            }`}
          >
            {s === "All" ? "All" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onRetry={() => void fetchJobs()}
        />
      )}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2" aria-label="Loading jobs">
          {Array.from({ length: 4 }).map((_, index) => (
            <JobCardSkeleton key={index} />
          ))}
        </div>
      )}

      {!loading && (
        <>
          <JobSection
            title="Posted Jobs"
            subtitle="Jobs you created as a client"
            allJobs={postedJobs}
            jobs={filteredPosted}
            filterActive={statusFilter !== "All"}
            wallet={wallet}
            role="client"
            actionLoading={actionLoading}
            onAction={handleAction}
            onRequestAction={requestDashAction}
            onClearFilter={() => setStatusFilter("All")}
            selectedJobs={selectedJobs}
            onToggleBatchSelect={(id) => {
              setSelectedJobs((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onBatchApprove={handleBatchApprove}
            batchLoading={batchLoading}
            selectedJobIds={selectedJobIds}
            onToggleSelectBulk={handleToggleSelect}
            onSelectAll={handleSelectAllOpen}
            onDeselectAll={handleDeselectAll}
            onBulkCancel={() => setShowBulkConfirm(true)}
            bulkCancelProgress={bulkCancelProgress}
          />
          <JobSection
            title="Accepted Jobs"
            subtitle="Jobs you accepted as a freelancer"
            allJobs={acceptedJobs}
            jobs={filteredAccepted}
            filterActive={statusFilter !== "All"}
            wallet={wallet}
            role="freelancer"
            actionLoading={actionLoading}
            onAction={handleAction}
            onRequestAction={requestDashAction}
            onClearFilter={() => setStatusFilter("All")}
          />

          <div>
            <h2 className="text-lg font-semibold">Saved Jobs</h2>
            <p className="mb-3 text-sm text-slate-500">Jobs you bookmarked for later</p>
            {bookmarkedLoading && bookmarkedJobs.length === 0 && (
              <div className="grid gap-4 sm:grid-cols-2" aria-label="Loading saved jobs">
                {Array.from({ length: 2 }).map((_, index) => (
                  <JobCardSkeleton key={index} />
                ))}
              </div>
            )}
            {!bookmarkedLoading && bookmarkedJobs.length === 0 && (
              <EmptyState
                title="No saved jobs yet"
                description="Bookmark jobs from the home page to see them here."
              />
            )}
            {bookmarkedJobs.length > 0 && (
              <ul className="grid list-none gap-4 sm:grid-cols-2" aria-label="Saved jobs">
                {bookmarkedJobs.map(({ id, job }) => {
                  const isOwnJob =
                    (wallet && job.client === wallet) || job.freelancer === wallet;
                  return (
                    <li key={id}>
                      <article className="interactive-card h-full p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-medium">{job.title || `Job #${id}`}</h3>
                            {job.category && (
                              <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                {job.category}
                              </span>
                            )}
                          </div>
                          <StatusPill status={job.status} />
                        </div>
                        <div className="mt-2 space-y-1 text-sm text-slate-600">
                          <p className="flex min-w-0 items-baseline gap-1">
                            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap tabular-nums">
                              {toXlm(job.amount)}
                            </span>
                            <span className="shrink-0">XLM</span>
                          </p>
                          <p className="truncate font-mono text-xs text-slate-400">
                            Token:{" "}
                            {job.token ? (
                              <TruncatedAddress address={job.token} className="font-mono text-xs text-slate-400" />
                            ) : (
                              "N/A"
                            )}
                          </p>
                          <p>
                            {(() => {
                              const deadline = formatDeadline(job.deadline);
                              if (!deadline) return "Deadline: No deadline";
                              return `Deadline: ${deadline.isPast ? "Past due" : deadline.relative} • ${deadline.exact}`;
                            })()}
                          </p>
                        </div>
                        {isOwnJob && (
                          <p className="mt-2 text-xs text-amber-600">This is your own job</p>
                        )}
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Issue #453 — Bulk cancel confirmation dialog */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h2 className="text-base font-semibold text-slate-900">Cancel {selectedJobIds.size} jobs?</h2>
            <p className="mt-1 text-sm text-slate-600">
              This will cancel all {selectedJobIds.size} selected open jobs and refund the escrowed funds to your wallet. This action cannot be undone.
            </p>
            <ul className="mt-3 max-h-40 overflow-y-auto space-y-1 text-sm text-slate-500">
              {Array.from(selectedJobIds).map((id) => {
                const entry = postedJobs.find((j) => j.id === id);
                return (
                  <li key={id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5">
                    <span>Job #{id}</span>
                    {entry && <span className="text-xs tabular-nums">{toXlm(entry.job.amount)} XLM refund</span>}
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                onClick={() => setShowBulkConfirm(false)}
              >
                Go back
              </button>
              <button
                className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                onClick={() => void handleBulkCancel()}
              >
                Cancel {selectedJobIds.size} jobs
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingAction !== null && (() => {
        const { type, jobId, amountXlm } = pendingAction;
        const configs = {
          cancelJob: {
            title: "Cancel this job?",
            description: "Cancelling will close the job and return the escrowed funds to your wallet. This action cannot be undone.",
            consequences: ["The job moves to Cancelled status permanently.", "The freelancer (if any) will lose access to the job."],
            impactLine: `${amountXlm} will be refunded to your wallet`,
            confirmLabel: "Yes, cancel job",
            variant: "danger" as const,
            suppressKey: CONFIRM_KEYS.cancelJob,
          },
          approveWork: {
            title: "Approve and release payment?",
            description: "Approving the submitted work releases the escrowed funds to the freelancer minus the 2.5% platform fee. This action is final.",
            consequences: ["The job moves to Completed status permanently.", "Platform fee (2.5%) will be deducted before transfer."],
            impactLine: `${amountXlm} (minus 2.5% fee) will be released to the freelancer`,
            confirmLabel: "Yes, approve & pay",
            variant: "primary" as const,
            suppressKey: CONFIRM_KEYS.approveWork,
          },
          submitWork: {
            title: "Submit work for review?",
            description: "Submitting notifies the client that your work is ready for review. This action cannot be undone.",
            consequences: ["The job moves to Submitted for Review status.", "The client can then approve or raise a dispute."],
            confirmLabel: "Yes, submit work",
            variant: "warning" as const,
            suppressKey: CONFIRM_KEYS.submitWork,
          },
          freelancerCancelJob: {
            title: "Cancel this job?",
            description: "Cancelling as a freelancer returns the full escrowed amount to the client. This action cannot be undone.",
            consequences: ["The job moves to Cancelled status permanently.", "The full escrow amount is refunded to the client."],
            impactLine: `${amountXlm} will be refunded to the client`,
            confirmLabel: "Yes, cancel job",
            variant: "danger" as const,
            suppressKey: CONFIRM_KEYS.freelancerCancelJob,
          },
          enforceDeadline: {
            title: "Enforce the deadline?",
            description: "Enforcing finalizes the job at its stated deadline and settles the escrowed amount according to the contract terms. This action cannot be undone.",
            consequences: ["The job is closed against its deadline.", "The escrowed funds are settled per the contract terms."],
            confirmLabel: "Yes, enforce deadline",
            variant: "danger" as const,
            suppressKey: CONFIRM_KEYS.enforceDeadline,
          },
        };
        const cfg = configs[type];
        return (
          <ConfirmDialog
            open={true}
            {...cfg}
            loading={actionLoading === jobId}
            onConfirm={() => void handleConfirmCancel()}
            onCancel={() => setPendingAction(null)}
          />
        );
      })()}
    </section>
    </DashboardWidgets>
  );
}

function JobSection({
  title,
  subtitle,
  allJobs,
  jobs,
  filterActive,
  wallet,
  role,
  actionLoading,
  onAction,
  onRequestAction,
  onClearFilter,
  selectedJobs,
  onToggleBatchSelect,
  onBatchApprove,
  batchLoading,
  selectedJobIds = new Set(),
  onToggleSelectBulk,
  onSelectAll,
  onDeselectAll,
  onBulkCancel,
  bulkCancelProgress,
}: {
  title: string;
  subtitle: string;
  allJobs: Array<{ id: number; job: Job }>;
  jobs: Array<{ id: number; job: Job }>;
  filterActive: boolean;
  wallet: string;
  role: "client" | "freelancer";
  actionLoading: number | null;
  onAction: (fn: () => Promise<unknown>, jobId: number, notification?: { event: NotificationEvent; message: string }) => Promise<void>;
  onRequestAction: (type: PendingDashAction["type"], jobId: number, amountXlm: string) => void;
  onClearFilter: () => void;
  selectedJobs?: Set<number>;
  onToggleBatchSelect?: (id: number) => void;
  onBatchApprove?: () => void;
  batchLoading?: boolean;
  selectedJobIds?: Set<number>;
  onToggleSelectBulk?: (id: number) => void;
  onToggleSelect?: (id: number) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onBulkCancel?: () => void;
  bulkCancelProgress?: { done: number; total: number; failed: number[] } | null;
}) {
  const pendingReviewIds = allJobs
    .filter((j) => j.job.status === "SubmittedForReview")
    .map((j) => j.id);
  const hasPendingReview = pendingReviewIds.length > 0;
  const openClientJobs = role === "client" ? jobs.filter((j) => j.job.status === "Open") : [];
  const selectionCount = openClientJobs.filter((j) => selectedJobIds.has(j.id)).length;
  const allOpenSelected =
    openClientJobs.length > 0 && openClientJobs.every((j) => selectedJobIds.has(j.id));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {role === "client" && hasPendingReview && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {selectedJobs?.size ?? 0} of {pendingReviewIds.length} selected
              </span>
              <button
                type="button"
                onClick={onBatchApprove}
                disabled={!selectedJobs || selectedJobs.size === 0 || batchLoading}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batchLoading ? "Approving..." : `Approve Selected (${selectedJobs?.size ?? 0})`}
              </button>
            </div>
          )}
          {role === "client" && openClientJobs.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-800"
                onClick={allOpenSelected ? onDeselectAll : onSelectAll}
              >
                {allOpenSelected ? "Deselect all" : "Select all open"}
              </button>
              {selectionCount >= 2 && (
                <button
                  type="button"
                  disabled={!!bulkCancelProgress}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                  onClick={onBulkCancel}
                >
                  {bulkCancelProgress
                    ? `Cancelling... ${bulkCancelProgress.done}/${bulkCancelProgress.total}`
                    : `Cancel selected (${selectionCount})`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {jobs.length === 0 ? (
        // The filter-empty CTA renders once (client section) instead of
        // duplicating an identical message/button across both sections.
        filterActive && allJobs.length > 0 && role === "client" ? (
          <NoResultsState
            title="No jobs match this filter"
            description="Try a different status or clear the filter to show every job in this section."
            actionLabel="Clear filter"
            onAction={onClearFilter}
          />
        ) : (
          <EmptyState title="No jobs yet" description="No jobs match this filter yet." />
        )
      ) : (
        <ul className="grid list-none gap-4 sm:grid-cols-2" aria-label={title}>
          {jobs.map(({ id, job }) => {
            const canBulkCancel = job.status === "Open" && role === "client";
            const canBatchApprove = job.status === "SubmittedForReview" && role === "client";
            const isSelected = canBulkCancel
              ? selectedJobIds.has(id)
              : canBatchApprove
                ? (selectedJobs?.has(id) ?? false)
                : false;
            const toggle =
              canBulkCancel
                ? onToggleSelectBulk
                : canBatchApprove
                  ? onToggleBatchSelect
                  : undefined;

            return (
              <li key={id}>
                <JobCard
                  id={id}
                  job={job}
                  wallet={wallet}
                  role={role}
                  isLoading={actionLoading === id}
                  onAction={onAction}
                  onRequestAction={onRequestAction}
                  isSelected={isSelected}
                  onToggleSelect={toggle}
                  selectMode={canBulkCancel ? "cancel" : canBatchApprove ? "approve" : undefined}
                />
              </li>
            );
          })}
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
  onRequestAction,
  isSelected = false,
  onToggleSelect,
  selectMode,
}: {
  id: number;
  job: Job;
  wallet: string;
  role: "client" | "freelancer";
  isLoading: boolean;
  onAction: (fn: () => Promise<unknown>, jobId: number, notification?: { event: NotificationEvent; message: string }) => Promise<void>;
  onRequestAction: (type: PendingDashAction["type"], jobId: number, amountXlm: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  selectMode?: "cancel" | "approve";
}) {
  const actions = getActions(id, job, wallet, role);
  const amountXlm = `${toXlm(job.amount)} XLM`;
  const ringClass =
    isSelected && selectMode === "approve"
      ? "ring-2 ring-emerald-400"
      : isSelected
        ? "ring-2 ring-red-400"
        : "";

  return (
    <article className={`interactive-card h-full p-4 ${ringClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {onToggleSelect && (
            <input
              type="checkbox"
              aria-label={
                selectMode === "approve"
                  ? `Select Job #${id} for batch approval`
                  : `Select Job #${id} for bulk cancellation`
              }
              checked={isSelected}
              onChange={() => onToggleSelect(id)}
              className={`h-4 w-4 rounded border-slate-300 cursor-pointer ${
                selectMode === "approve" ? "text-emerald-600" : "accent-red-600"
              }`}
            />
          )}
          <div>
            <h3 className="font-medium">{job.title || `Job #${id}`}</h3>
            {job.category && (
              <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {job.category}
              </span>
            )}
          </div>
        </div>
        <StatusPill status={job.status} />
      </div>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        <p className="flex min-w-0 items-baseline gap-1">
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap tabular-nums">
            {toXlm(job.amount)}
          </span>
          <span className="shrink-0">XLM</span>
        </p>
        <p className="truncate font-mono text-xs text-slate-400">
          Token:{" "}
          {job.token ? (
            <TruncatedAddress address={job.token} className="font-mono text-xs text-slate-400" />
          ) : (
            "N/A"
          )}
        </p>
        <p>
          {(() => {
            const deadline = formatDeadline(job.deadline);
            if (!deadline) return "Deadline: No deadline";
            return `Deadline: ${deadline.isPast ? "Past due" : deadline.relative} • ${deadline.exact}`;
          })()}
        </p>
        {role === "client" && job.freelancer && (
          <p className="truncate">
            Freelancer: <TruncatedAddress address={job.freelancer} />
          </p>
        )}
        {role === "freelancer" && (
          <p className="truncate">
            Client: <TruncatedAddress address={job.client} />
          </p>
        )}
      </div>
      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action) => {
            const needsConfirm =
              action.label === "Cancel Job" ||
              action.label === "Approve Work" ||
              action.label === "Submit Work" ||
              action.label === "Enforce Deadline";

            const actionTypeMap: Record<string, PendingDashAction["type"]> = {
              "Cancel Job": role === "freelancer" ? "freelancerCancelJob" : "cancelJob",
              "Approve Work": "approveWork",
              "Submit Work": "submitWork",
              "Enforce Deadline": "enforceDeadline",
            };

            return (
              <button
                key={action.label}
                disabled={isLoading}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:max-w-44"
                onClick={() => {
                  if (needsConfirm) {
                    onRequestAction(actionTypeMap[action.label], id, amountXlm);
                    return;
                  }
                  void onAction(() => action.fn(), id, action.notification ?? undefined);
                }}
                title={action.label}
                aria-haspopup={needsConfirm ? "dialog" : undefined}
              >
                <span className="block truncate">{isLoading ? "..." : action.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}

type Action = {
  label: string;
  fn: () => Promise<unknown>;
  notification?: { event: NotificationEvent; message: string };
};

function getActions(
  id: number,
  job: Job,
  wallet: string,
  role: "client" | "freelancer",
): Action[] {
  const actions: Action[] = [];
  const jobId = String(id);

  if (role === "client") {
    if (job.status === "Open") {
      actions.push({
        label: "Cancel Job",
        fn: () => cancelJob(wallet, jobId),
        notification: { event: "job_cancelled", message: `Job #${id} was cancelled and funds refunded.` },
      });
    }
    if (job.status === "SubmittedForReview") {
      actions.push({
        label: "Approve Work",
        fn: () => approveWork(wallet, jobId),
        notification: { event: "work_approved", message: `Work for Job #${id} was approved and payment released.` },
      });
    }
    if (job.status === "InProgress" && job.deadline !== "0") {
      actions.push({
        label: "Enforce Deadline",
        fn: () => enforceDeadline(wallet, jobId),
        notification: undefined,
      });
    }
  }

  if (role === "freelancer") {
    if (job.status === "InProgress") {
      actions.push({
        label: "Submit Work",
        fn: () => submitWork(wallet, jobId),
        notification: { event: "work_submitted", message: `Work for Job #${id} was submitted for review.` },
      });
      actions.push({
        label: "Cancel Job",
        fn: () => freelancerCancelJob(wallet, jobId),
        notification: undefined,
      });
    }
  }

  return actions;
}
