"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X as XIcon,
  Sparkles,
  Filter,
  CircleAlert,
} from "lucide-react";
import SectionCard from "@/components/SectionCard";
import StatusPill from "@/components/StatusPill";
import TruncatedAddress from "@/components/TruncatedAddress";
import { formatDeadline, formatXlmWithFiat, type FiatCurrency, type XlmFiatRateCache } from "@/lib/format";
import { JOB_CATEGORIES } from "@/lib/job-categories";
import {
  getSimilarJobs,
  isMarkedNotInterested,
  markNotInterested,
  SIMILARITY_CRITERIA,
  type ScoredJob,
  type SimilarityCriteria,
} from "@/lib/similar-jobs";
import type { Job } from "@/lib/types";

interface SimilarJobsSectionProps {
  job: Job;
  jobId: string;
  description: string | null;
  fiatCurrency: FiatCurrency;
  fiatRates: XlmFiatRateCache | null;
}

type FilterValue = SimilarityCriteria;

export default function SimilarJobsSection({
  job,
  jobId,
  description,
  fiatCurrency,
  fiatRates,
}: SimilarJobsSectionProps) {
  const [criteria, setCriteria] = useState<FilterValue>("all");
  const [results, setResults] = useState<ScoredJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;

    getSimilarJobs(job, jobId, criteria, description || undefined)
      .then(({ jobs }) => {
        if (cancelled) return;
        setResults(jobs);
        setDismissedIds((prev) => {
          const next = new Set(prev);
          for (const item of jobs) {
            if (isMarkedNotInterested(jobId, String(item.id))) next.add(String(item.id));
          }
          return next;
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load similar jobs.");
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [job, jobId, criteria, description]);

  const handleNotInterested = useCallback(
    (targetId: string) => {
      markNotInterested(jobId, targetId);
      setDismissedIds((prev) => new Set(prev).add(targetId));
    },
    [jobId],
  );

  const handleCriteriaChange = useCallback((next: FilterValue) => {
    setCriteria(next);
    setLoading(true);
    setError(null);
  }, []);

  const visible = useMemo(
    () => results.filter((item) => !dismissedIds.has(String(item.id))),
    [results, dismissedIds],
  );

  const reasonsLabel = (reasons: SimilarityCriteria[]): string => {
    const labels: Record<string, string> = {
      amount: "Amount",
      category: "Category",
      description: "Description",
    };
    const list = reasons.map((r) => labels[r]).filter(Boolean);
    return list.length > 0 ? list.join(", ") : "Similar";
  };

  const renderSkeleton = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="interactive-card h-full animate-pulse rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="h-5 w-28 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-20 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-full rounded bg-slate-200" />
          <div className="mt-4 flex gap-2">
            <div className="h-8 w-24 rounded-md bg-slate-200" />
            <div className="h-8 w-24 rounded-md bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <SectionCard
      title="Similar Jobs"
      description="Opportunities matched to this job by category, amount, and description."
    >
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Match by:
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Similarity criteria">
            {SIMILARITY_CRITERIA.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleCriteriaChange(option.value)}
                aria-pressed={criteria === option.value}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  criteria === option.value
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <>{renderSkeleton()}</>}

      {!loading && error && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <CircleAlert className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          {error}
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
          <p className="mt-2 font-medium text-slate-700">
            No similar jobs found
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Try a different match criterion, or check back later for new opportunities.
          </p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <ul className="grid list-none gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map(({ id, job: candidate, score, reasons }) => {
            const cat = JOB_CATEGORIES.find(
              (c) => c.id === candidate.category?.toLowerCase() || c.label === candidate.category,
            );
            const Icon = cat?.icon;
            const deadline = formatDeadline(candidate.deadline);
            return (
              <li key={id}>
                <article className="interactive-card flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-medium text-slate-900">
                      <Link href={`/job/${id}`} className="hover:underline">
                        Job #{id}
                      </Link>
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleNotInterested(String(id))}
                      className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`Not interested in Job #${id}`}
                      title="Not interested"
                    >
                      <XIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={candidate.status} />
                    {cat && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cat.colorClass}`}
                      >
                        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                        {cat.label}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-sm font-semibold tabular-nums text-slate-700">
                    {formatXlmWithFiat(candidate.amount, fiatCurrency, fiatRates?.rates)}
                  </p>

                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {candidate.title ? candidate.title : `Job posted by ${candidate.client}`}
                  </p>

                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                      {Math.round(score * 100)}% match
                    </span>
                    {reasons.length > 0 && (
                      <span className="text-slate-400">• {reasonsLabel(reasons)}</span>
                    )}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    {deadline && (
                      <span title={deadline.exact}>
                        {deadline.isPast ? "Past due" : `Due ${deadline.relative}`}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <TruncatedAddress address={candidate.client} chars={4} />
                    </span>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
