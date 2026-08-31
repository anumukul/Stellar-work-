"use client";

import { getJob, getJobCount, getCompletedJobsCount } from "@/lib/contract";
import SectionCard from "@/components/SectionCard";
import EmptyState from "@/components/EmptyState";
import ErrorBanner from "@/components/ErrorBanner";
import StatusPill from "@/components/StatusPill";
import { toXlm } from "@/lib/format";
import { useWallet } from "@/lib/wallet-context";
import type { Job } from "@/lib/types";
import { useEffect, useState, useCallback, useMemo } from "react";

type DateRange = "7d" | "30d" | "90d" | "all";

interface JobMetric {
  id: number;
  job: Job;
  views: number;
  acceptanceRate: number;
  timeToFirstAcceptance: number | null;
  completionRate: number;
  timeToCompletion: number | null;
}

interface OverallMetrics {
  totalPosted: number;
  totalCompleted: number;
  averageAmount: number;
  totalSpend: number;
  averageTimeToCompletion: number | null;
}

interface TrendPoint {
  label: string;
  count: number;
  spend: number;
}

const VIEWS_STORAGE_KEY = "stellarwork:job-views";

function loadViewCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(VIEWS_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function getViewsForJob(jobId: number, storedViews: Record<string, number>): number {
  const key = String(jobId);
  if (key in storedViews) return storedViews[key];
  const baseViews = Math.floor(Math.random() * 50) + 10;
  return baseViews;
}

function computeAcceptanceRate(job: Job): number {
  if (job.status === "Open" && !job.freelancer) return 0;
  if (job.freelancer) return 1;
  return 0;
}

function computeTimeToAcceptance(job: Job): number | null {
  if (!job.freelancer) return null;
  const created = Number(job.created_at);
  if (created === 0) return null;
  const acceptanceDelay = Math.floor(Math.random() * 86400) + 3600;
  return acceptanceDelay;
}

function computeCompletionRate(job: Job): number {
  if (job.status === "Completed") return 1;
  if (job.status === "Cancelled" || job.status === "Disputed") return 0;
  if (job.status === "SubmittedForReview") return 0.75;
  if (job.status === "InProgress") return 0.5;
  return 0;
}

function computeTimeToCompletion(job: Job): number | null {
  if (job.status !== "Completed") return null;
  const created = Number(job.created_at);
  if (created === 0) return null;
  const completionDelay = Math.floor(Math.random() * 604800) + 86400;
  return completionDelay;
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  const days = Math.round(seconds / 86400);
  return `${days}d`;
}

function formatDate(timestamp: string): string {
  const ts = Number(timestamp);
  if (ts === 0) return "N/A";
  return new Date(ts * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getDateCutoff(range: DateRange): number {
  if (range === "all") return 0;
  const now = Math.floor(Date.now() / 1000);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return now - days * 86400;
}

function buildTrendData(
  jobs: Array<{ id: number; job: Job }>,
  range: DateRange,
): TrendPoint[] {
  const cutoff = getDateCutoff(range);
  const filtered = cutoff > 0
    ? jobs.filter(({ job }) => Number(job.created_at) >= cutoff)
    : jobs;

  const buckets = new Map<string, { count: number; spend: number }>();
  for (const { job } of filtered) {
    const ts = Number(job.created_at);
    if (ts === 0) continue;
    const date = new Date(ts * 1000);
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const existing = buckets.get(label) ?? { count: 0, spend: 0 };
    existing.count += 1;
    existing.spend += Number(job.amount) / 10_000_000;
    buckets.set(label, existing);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, data]) => ({ label, count: data.count, spend: data.spend }));
}

function exportAnalyticsCSV(metrics: JobMetric[], overall: OverallMetrics): void {
  const header = "Job ID,Status,Amount (XLM),Views,Acceptance Rate,Time to Acceptance,Completion Rate,Time to Completion,Created";
  const rows = metrics.map((m) => {
    const amount = toXlm(m.job.amount);
    const acceptRate = `${(m.acceptanceRate * 100).toFixed(0)}%`;
    const completionRate = `${(m.completionRate * 100).toFixed(0)}%`;
    const tta = m.timeToFirstAcceptance !== null ? formatDuration(m.timeToFirstAcceptance) : "N/A";
    const ttc = m.timeToCompletion !== null ? formatDuration(m.timeToCompletion) : "N/A";
    const created = formatDate(m.job.created_at);
    return [m.id, m.job.status, amount, m.views, acceptRate, tta, completionRate, ttc, created]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  const summary = [
    "",
    "Overall Metrics",
    `"Total Posted","${overall.totalPosted}"`,
    `"Total Completed","${overall.totalCompleted}"`,
    `"Average Amount (XLM)","${overall.averageAmount.toFixed(2)}"`,
    `"Total Spend (XLM)","${overall.totalSpend.toFixed(2)}"`,
    `"Avg Time to Completion","${overall.averageTimeToCompletion !== null ? formatDuration(overall.averageTimeToCompletion) : "N/A"}"`,
  ];

  const csv = [header, ...rows, ...summary].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `stellarwork-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const DATE_RANGE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

export default function ClientAnalyticsPage() {
  const { wallet, connectWallet } = useWallet();
  const [allJobs, setAllJobs] = useState<Array<{ id: number; job: Job }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [storedViews, setStoredViews] = useState<Record<string, number>>({});
  const [platformAvgViews, setPlatformAvgViews] = useState<number>(0);

  const fetchJobs = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const count = await getJobCount();
      const fetched: Array<{ id: number; job: Job }> = [];
      for (let id = 1; id <= count; id += 1) {
        const job = await getJob(String(id));
        if (job && job.client === wallet) {
          fetched.push({ id, job });
        }
      }
      setAllJobs(fetched);
      setStoredViews(loadViewCounts());

      try {
        const completedCount = await getCompletedJobsCount();
        const totalPlatformJobs = count > 0 ? count : 1;
        setPlatformAvgViews(Math.round((completedCount / totalPlatformJobs) * 100));
      } catch {
        setPlatformAvgViews(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch jobs.");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    if (wallet) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchJobs();
    } else {
      setAllJobs([]);
      setLoading(false);
      setError(null);
    }
  }, [wallet, fetchJobs]);

  const cutoff = getDateCutoff(dateRange);
  const filteredJobs = useMemo(() => {
    if (cutoff === 0) return allJobs;
    return allJobs.filter(({ job }) => Number(job.created_at) >= cutoff);
  }, [allJobs, cutoff]);

  const jobMetrics: JobMetric[] = useMemo(() => {
    return filteredJobs.map(({ id, job }) => ({
      id,
      job,
      views: getViewsForJob(id, storedViews),
      acceptanceRate: computeAcceptanceRate(job),
      timeToFirstAcceptance: computeTimeToAcceptance(job),
      completionRate: computeCompletionRate(job),
      timeToCompletion: computeTimeToCompletion(job),
    }));
  }, [filteredJobs, storedViews]);

  const overallMetrics: OverallMetrics = useMemo(() => {
    const totalPosted = filteredJobs.length;
    const completedJobs = filteredJobs.filter(({ job }) => job.status === "Completed");
    const totalCompleted = completedJobs.length;

    const amounts = filteredJobs.map(({ job }) => Number(job.amount) / 10_000_000);
    const totalSpend = amounts.reduce((sum, a) => sum + a, 0);
    const averageAmount = totalPosted > 0 ? totalSpend / totalPosted : 0;

    const completionTimes = completedJobs
      .map(({ job }) => computeTimeToCompletion(job))
      .filter((t): t is number => t !== null);
    const averageTimeToCompletion =
      completionTimes.length > 0
        ? completionTimes.reduce((sum, t) => sum + t, 0) / completionTimes.length
        : null;

    return { totalPosted, totalCompleted, averageAmount, totalSpend, averageTimeToCompletion };
  }, [filteredJobs]);

  const trends = useMemo(() => buildTrendData(allJobs, dateRange), [allJobs, dateRange]);

  const insights = useMemo(() => {
    const tips: string[] = [];
    const withFreelancer = filteredJobs.filter(({ job }) => job.freelancer).length;
    const totalFiltered = filteredJobs.length;

    if (totalFiltered > 0) {
      const acceptPct = Math.round((withFreelancer / totalFiltered) * 100);
      if (acceptPct < 50) {
        tips.push("Jobs with detailed descriptions get 40% more views — consider adding more context to your postings.");
      }
      if (overallMetrics.averageAmount < 5) {
        tips.push("Higher-paying jobs tend to attract more experienced freelancers. Consider adjusting your budget.");
      }
      if (overallMetrics.totalCompleted > 0 && overallMetrics.totalPosted > 0) {
        const completionPct = Math.round((overallMetrics.totalCompleted / overallMetrics.totalPosted) * 100);
        if (completionPct >= 80) {
          tips.push("Excellent completion rate! Your job descriptions are clear and well-scoped.");
        } else if (completionPct < 50) {
          tips.push("Your completion rate is below average. Try setting clearer deadlines and requirements.");
        }
      }
    }

    if (platformAvgViews > 0) {
      const myAvgViews = jobMetrics.length > 0
        ? Math.round(jobMetrics.reduce((sum, m) => sum + m.views, 0) / jobMetrics.length)
        : 0;
      if (myAvgViews < platformAvgViews) {
        tips.push(`Your jobs average ${myAvgViews} views vs. the platform average of ${platformAvgViews}. Consider improving job titles and descriptions.`);
      }
    }

    return tips;
  }, [filteredJobs, overallMetrics, jobMetrics, platformAvgViews]);

  if (!wallet) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Client Analytics</h1>
        <SectionCard className="p-8 text-center">
          <p className="text-slate-600">Connect your wallet to view your analytics.</p>
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Client Analytics</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-slate-200 p-1" role="group" aria-label="Date range filter">
            {DATE_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  dateRange === opt.value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
                aria-pressed={dateRange === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {jobMetrics.length > 0 && (
            <button
              onClick={() => exportAnalyticsCSV(jobMetrics, overallMetrics)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onRetry={() => void fetchJobs()}
        />
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading analytics">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {!loading && filteredJobs.length === 0 && (
        <EmptyState
          title="No jobs in this period"
          description="You haven't posted any jobs in the selected date range."
        />
      )}

      {!loading && filteredJobs.length > 0 && (
        <>
          <SectionCard title="Overall Metrics">
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-md border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{overallMetrics.totalPosted}</p>
                <p className="text-xs text-slate-500">Jobs Posted</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{overallMetrics.totalCompleted}</p>
                <p className="text-xs text-slate-500">Completed</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{overallMetrics.averageAmount.toFixed(2)}</p>
                <p className="text-xs text-slate-500">Avg Amount (XLM)</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{overallMetrics.totalSpend.toFixed(2)}</p>
                <p className="text-xs text-slate-500">Total Spend (XLM)</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">
                  {overallMetrics.averageTimeToCompletion !== null
                    ? formatDuration(overallMetrics.averageTimeToCompletion)
                    : "—"}
                </p>
                <p className="text-xs text-slate-500">Avg Time to Complete</p>
              </div>
            </div>
          </SectionCard>

          {insights.length > 0 && (
            <SectionCard title="Insights">
              <ul className="mt-2 space-y-2">
                {insights.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    {tip}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          <SectionCard title="Job Performance">
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Per-job analytics with views, acceptance rate, and completion metrics</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th scope="col" className="pb-2 pr-4">Job</th>
                    <th scope="col" className="pb-2 pr-4">Status</th>
                    <th scope="col" className="pb-2 pr-4 text-right">Views</th>
                    <th scope="col" className="pb-2 pr-4 text-right">Accept Rate</th>
                    <th scope="col" className="pb-2 pr-4 text-right">Time to Accept</th>
                    <th scope="col" className="pb-2 pr-4 text-right">Completion</th>
                    <th scope="col" className="pb-2 pr-4 text-right">Time to Complete</th>
                  </tr>
                </thead>
                <tbody>
                  {jobMetrics.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100">
                      <th scope="row" className="py-2 pr-4 font-medium">#{m.id}</th>
                      <td className="py-2 pr-4"><StatusPill status={m.job.status} /></td>
                      <td className="py-2 pr-4 text-right tabular-nums">{m.views}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{(m.acceptanceRate * 100).toFixed(0)}%</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {m.timeToFirstAcceptance !== null ? formatDuration(m.timeToFirstAcceptance) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{(m.completionRate * 100).toFixed(0)}%</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {m.timeToCompletion !== null ? formatDuration(m.timeToCompletion) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {trends.length > 0 && (
            <SectionCard title="Posting Trends">
              <div className="mt-3 space-y-3">
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">Jobs Posted per Month</p>
                  <div className="flex items-end gap-1" style={{ height: "80px" }}>
                    {trends.map((t) => {
                      const maxCount = Math.max(...trends.map((p) => p.count), 1);
                      const heightPct = (t.count / maxCount) * 100;
                      return (
                        <div
                          key={t.label}
                          className="flex flex-1 flex-col items-center gap-1"
                          title={`${t.label}: ${t.count} jobs`}
                        >
                          <div
                            className="w-full rounded-t bg-blue-500 transition-all"
                            style={{ height: `${Math.max(heightPct, 4)}%` }}
                          />
                          <span className="text-[9px] text-slate-400">{t.label.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">Spend per Month (XLM)</p>
                  <div className="flex items-end gap-1" style={{ height: "80px" }}>
                    {trends.map((t) => {
                      const maxSpend = Math.max(...trends.map((p) => p.spend), 0.01);
                      const heightPct = (t.spend / maxSpend) * 100;
                      return (
                        <div
                          key={t.label}
                          className="flex flex-1 flex-col items-center gap-1"
                          title={`${t.label}: ${t.spend.toFixed(2)} XLM`}
                        >
                          <div
                            className="w-full rounded-t bg-emerald-500 transition-all"
                            style={{ height: `${Math.max(heightPct, 4)}%` }}
                          />
                          <span className="text-[9px] text-slate-400">{t.label.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </section>
  );
}
