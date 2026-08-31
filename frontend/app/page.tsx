"use client";

import ErrorBanner from "@/components/ErrorBanner";
import EmptyState from "@/components/EmptyState";
import InfoTooltip from "@/components/InfoTooltip";
import LoadingState from "@/components/LoadingState";
import NoResultsState from "@/components/NoResultsState";
import PullToRefresh from "@/components/PullToRefresh";
import JobCardSkeleton from "@/components/JobCardSkeleton";
import SectionCard from "@/components/SectionCard";
import TruncatedAddress from "@/components/TruncatedAddress";
import ComparisonBar from "@/components/ComparisonBar";
import CancelJobConfirmModal from "@/components/CancelJobConfirmModal";
import SwipeableJobCard from "@/components/SwipeableJobCard";
import ClientReputationBadge from "@/components/ClientReputationBadge";
import JobFilterPanel, { DEFAULT_FILTERS, type JobFilters } from "@/components/JobFilterPanel";
import { acceptJob, cancelJob, getDescriptionCid, getJob, getJobCount } from "@/lib/contract";
import { fetchFromIpfs } from "@/lib/ipfs-service";
import { useNotifications } from "@/lib/notifications-context";
import {
  FIAT_CURRENCIES,
  fetchXlmFiatRates,
  formatDeadline,
  formatXlmFiatRateTooltip,
  formatXlmWithFiat,
  getCachedXlmFiatRates,
  getPreferredFiatCurrency,
  savePreferredFiatCurrency,
  toXlm,
  type FiatCurrency,
  type XlmFiatRateCache,
} from "@/lib/format";
import {
  clearRecentSearches,
  loadRecentSearches,
  removeRecentSearch,
  saveRecentSearches,
  updateRecentSearches,
} from "@/lib/recent-searches";
import { getExplorerTxUrl } from "@/lib/stellar";
import { getRecentJobIds, getJobWindowBounds } from "@/lib/recent-ids";
import Pagination from "@/components/Pagination";
import type { Job, JobStatus } from "@/lib/types";
import { useWallet } from "@/lib/wallet-context";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

const BOOKMARK_STORAGE_KEY = "stellarwork:bookmarked-jobs";
const COMPARE_IDS_PARAM = "compare";
const MAX_COMPARE_JOBS = 4;
const VIEW_MODE_STORAGE_KEY = "stellarwork:jobs-view-mode";
const JOBS_CACHE_KEY = "stellarwork:jobs-cache";
const JOBS_CACHE_TTL_MS = 30_000;

type JobsViewMode = "grid" | "list";
type SortOrder = "newest" | "oldest" | "highest_amount" | "deadline_asc";

function compareJobs(sortOrder: SortOrder) {
  return (a: { id: number; job: Job }, b: { id: number; job: Job }): number => {
    switch (sortOrder) {
      case "newest": {
        const aCreated = Number(a.job.created_at) || 0;
        const bCreated = Number(b.job.created_at) || 0;
        // Jobs without a creation timestamp sort last.
        if (aCreated === 0 && bCreated === 0) return a.id - b.id;
        if (aCreated === 0) return 1;
        if (bCreated === 0) return -1;
        return bCreated - aCreated || a.id - b.id;
      }
      case "oldest": {
        const aCreated = Number(a.job.created_at) || 0;
        const bCreated = Number(b.job.created_at) || 0;
        return aCreated - bCreated || a.id - b.id;
      }
      case "highest_amount": {
        const diff = BigInt(b.job.amount) - BigInt(a.job.amount);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      }
      case "deadline_asc": {
        const aDeadline = BigInt(a.job.deadline);
        const bDeadline = BigInt(b.job.deadline);
        // Jobs without a deadline sort last.
        if (aDeadline === 0n && bDeadline === 0n) return a.id - b.id;
        if (aDeadline === 0n) return 1;
        if (bDeadline === 0n) return -1;
        const diff = aDeadline - bDeadline;
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      }
    }
  };
}

function readViewMode(): JobsViewMode {
  if (typeof window === "undefined") return "grid";
  const stored = sessionStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === "list" ? "list" : "grid";
}

export default function HomePage() {
  const { wallet } = useWallet();
  const { addNotification } = useNotifications();
  const [jobs, setJobs] = useState<Array<{ id: number; job: Job }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    if (typeof window === "undefined") return 1;
    const p = new URLSearchParams(window.location.search).get("page");
    const n = p ? parseInt(p, 10) : NaN;
    return n > 0 ? n : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window === "undefined") return 10;
    const p = new URLSearchParams(window.location.search).get("pageSize");
    const n = p ? parseInt(p, 10) : NaN;
    return [10, 20, 50].includes(n) ? n : 10;
  });
  const [totalJobs, setTotalJobs] = useState(0);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    if (typeof window === "undefined") return "newest";
    const s = new URLSearchParams(window.location.search).get("sort");
    return s === "oldest"
      ? "oldest"
      : s === "highest_amount"
        ? "highest_amount"
        : s === "deadline_asc"
          ? "deadline_asc"
          : "newest";
  });
  const [statusFilter, setStatusFilter] = useState<JobStatus | "Active" | "all">(() => {
    if (typeof window === "undefined") return "Open";
    const s = new URLSearchParams(window.location.search).get("status");
    const validStatuses: string[] = ["Open", "InProgress", "SubmittedForReview", "Completed", "Cancelled", "Disputed", "Active", "all"];
    return validStatuses.includes(s ?? "") ? (s as JobStatus | "Active" | "all") : "Open";
  });
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([]);
  const [animatingBookmarkId, setAnimatingBookmarkId] = useState<number | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  const [recentSearches, setRecentSearches] = useState<string[] | null>(null);
  const [recentSearchesOpen, setRecentSearchesOpen] = useState(false);
  const [resultsAnnouncement, setResultsAnnouncement] = useState("");
  const [lastAnnouncedSignature, setLastAnnouncedSignature] = useState("");
  const [newJobIds, setNewJobIds] = useState<Set<number>>(() => new Set());
  const seenJobIdsRef = useRef<Set<number>>(new Set());
  const isInitialLoadRef = useRef(true);
  const [viewMode, setViewMode] = useState<JobsViewMode>("grid");
  const [fiatCurrency, setFiatCurrency] = useState<FiatCurrency>("USD");
  const [fiatRates, setFiatRates] = useState<XlmFiatRateCache | null>(null);
  const [fiatRateError, setFiatRateError] = useState<string | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [advancedFilters, setAdvancedFilters] = useState<JobFilters>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTERS;
    const params = new URLSearchParams(window.location.search);
    return {
      minAmount: params.get("minAmount") ?? "",
      maxAmount: params.get("maxAmount") ?? "",
      dateRange: (params.get("dateRange") as JobFilters["dateRange"]) ?? "all",
      freelancerStatus: (params.get("freelancerStatus") as JobFilters["freelancerStatus"]) ?? "all",
    };
  });

  // Comparison selection state — persisted in URL query params
  const [compareIds, setCompareIds] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(COMPARE_IDS_PARAM);
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => parseInt(s, 10))
      .filter((n) => !Number.isNaN(n) && n > 0)
      .slice(0, MAX_COMPARE_JOBS);
  });

  useEffect(() => {
    setViewMode(readViewMode());
    setFiatCurrency(getPreferredFiatCurrency());
    setFiatRates(getCachedXlmFiatRates());
  }, []);

  useEffect(() => {
    savePreferredFiatCurrency(fiatCurrency);
    let cancelled = false;
    setFiatRateError(null);

    fetchXlmFiatRates()
      .then((cache) => {
        if (!cancelled) setFiatRates(cache);
      })
      .catch(() => {
        if (!cancelled) {
          setFiatRateError("Fiat rates are unavailable; showing XLM only where needed.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fiatCurrency]);

  useEffect(() => {
    if (viewMode === "grid") {
      sessionStorage.removeItem(VIEW_MODE_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BOOKMARK_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return;
      const validIds = parsed
        .map((entry) => Number(entry))
        .filter((value) => Number.isInteger(value) && value > 0);
      setBookmarkedIds(validIds);
    } catch {
      // Ignore malformed local storage data and use empty bookmarks.
    }
  }, []);

  useEffect(() => {
    if (bookmarkedIds.length === 0) {
      localStorage.removeItem(BOOKMARK_STORAGE_KEY);
      return;
    }
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(bookmarkedIds));
  }, [bookmarkedIds]);

  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  useEffect(() => {
    if (recentSearches === null) return;
    saveRecentSearches(recentSearches);
  }, [recentSearches]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  // Sync advanced filters and comparison selection to URL query params.
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set("q", searchTerm.trim());
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 10) params.set("pageSize", String(pageSize));
    if (sortOrder !== "newest") params.set("sort", sortOrder);
    if (statusFilter !== "Open") params.set("status", statusFilter);
    if (advancedFilters.minAmount) params.set("minAmount", advancedFilters.minAmount);
    if (advancedFilters.maxAmount) params.set("maxAmount", advancedFilters.maxAmount);
    if (advancedFilters.dateRange !== "all") params.set("dateRange", advancedFilters.dateRange);
    if (advancedFilters.freelancerStatus !== "all")
      params.set("freelancerStatus", advancedFilters.freelancerStatus);
    if (compareIds.length > 0) params.set(COMPARE_IDS_PARAM, compareIds.join(","));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchTerm, page, pageSize, sortOrder, statusFilter, advancedFilters, compareIds, pathname, router]);

  function toggleCompare(id: number) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_COMPARE_JOBS) return prev;
      return [...prev, id];
    });
  }

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

      const cacheKey = `${JOBS_CACHE_KEY}:${sortOrder}`;
      const cachedRaw = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw) as { count: number; jobs: Array<{ id: number; job: Job }>; at: number };
          if (cached.count === count && Date.now() - cached.at < JOBS_CACHE_TTL_MS) {
            const descMap: Record<string, string> = {};
            for (const { job } of cached.jobs) {
              const stored = localStorage.getItem(`job-desc:${job.description_hash}`);
              if (stored) {
                // Verify integrity where possible; best-effort synchronous fallthrough
                try {
                  // We'll verify asynchronously below when populating from fetched results
                  descMap[job.description_hash] = stored;
                } catch {
                  // ignore
                }
              }
            }
            setDescriptions(descMap);
            setJobs(cached.jobs);
            isInitialLoadRef.current = false;
            setLoading(false);
            return;
          }
        } catch {
          localStorage.removeItem(cacheKey);
        }
      }

      // Calculate window for current page only to avoid fetching all jobs.
      const bounds = getJobWindowBounds(count, page, pageSize);
      const idsToFetch: string[] = [];
      if (bounds) {
        const ids = getRecentJobIds(bounds.startId, bounds.endId, sortOrder === "newest" ? "newest" : "oldest");
        for (const id of ids) idsToFetch.push(id);
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
          item !== null,
      );

      fetched.sort(compareJobs(sortOrder));

      const descMap: Record<string, string> = {};
      for (const { job } of fetched) {
        const hash = job.description_hash;
        const stored = localStorage.getItem(`job-desc:${hash}`);
        if (stored) {
          try {
            // verify integrity before using stored value
            // import verify lazily to avoid SSR issues
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { verifyHtmlMatchesHash } = await import("@/lib/crypto");
            // If verification fails, fall back to attempting IPFS fetch
            if (await verifyHtmlMatchesHash(stored, hash)) {
              descMap[hash] = stored;
              continue;
            }
          } catch {
            // proceed to attempt IPFS fetch
          }
        }
        try {
          const cid = await getDescriptionCid(hash);
          if (cid) {
            const text = await fetchFromIpfs(cid);
            // verify fetched text
            try {
              const { verifyHtmlMatchesHash } = await import("@/lib/crypto");
              if (await verifyHtmlMatchesHash(text, hash)) {
                descMap[hash] = text;
                localStorage.setItem(`job-desc:${hash}`, text);
              }
            } catch {
              // verification failed or crypto helper not available, skip storing
            }
          }
        } catch {
          // IPFS fetch failed, description will show fallback text
        }
      }
      setDescriptions(descMap);

      const incomingIds = fetched.map(({ id }) => id);
      if (!isInitialLoadRef.current) {
        const addedIds = incomingIds.filter((id) => !seenJobIdsRef.current.has(id));
        if (addedIds.length > 0) {
          setNewJobIds((prev) => {
            const next = new Set(prev);
            for (const id of addedIds) {
              next.add(id);
            }
            return next;
          });
        }
      }
      seenJobIdsRef.current = new Set(incomingIds);
      isInitialLoadRef.current = false;

      setJobs(fetched);

      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(cacheKey, JSON.stringify({
            count,
            jobs: fetched,
            at: Date.now(),
          }));
        }
      } catch {
        // storage full, skip caching
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch jobs.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortOrder]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleRefresh = () => {
      void refresh();
    };

    window.addEventListener("stellarwork:job-cancelled", handleRefresh);
    window.addEventListener("stellarwork:job-status-changed", handleRefresh);
    window.addEventListener("stellarwork:account-changed", handleRefresh);

    return () => {
      window.removeEventListener("stellarwork:job-cancelled", handleRefresh);
      window.removeEventListener("stellarwork:job-status-changed", handleRefresh);
      window.removeEventListener("stellarwork:account-changed", handleRefresh);
    };
  }, [refresh]);

  const normalizedSearchTerm = debouncedSearchTerm.trim().toLowerCase();

  const getDescription = useCallback((hash: string): string => {
    if (descriptions[hash]) return descriptions[hash];
    const stored = localStorage.getItem(`job-desc:${hash}`);
    if (stored) return stored;
    return "Description unavailable (posted from another device)";
  }, [descriptions]);

  const visibleJobs = useMemo(() => {
    const bookmarkedJobs = showBookmarkedOnly
      ? jobs.filter(({ id }) => bookmarkedIds.includes(id))
      : jobs;

    const now = Math.floor(Date.now() / 1000);
    const dateThresholds: Record<string, number> = {
      "24h": now - 86400,
      "7d": now - 7 * 86400,
      "30d": now - 30 * 86400,
    };

    const afterSearch = normalizedSearchTerm
      ? bookmarkedJobs.filter(({ job }) => {
          const description = getDescription(job.description_hash).toLowerCase();
          const title = (job.title || "").toLowerCase();
          const category = (job.category || "").toLowerCase();

          return [description, title, category].some((value) => value.includes(normalizedSearchTerm));
        })
      : bookmarkedJobs;

    return afterSearch.filter(({ job }) => {
      const { minAmount, maxAmount, dateRange, freelancerStatus } = advancedFilters;
      const amountXlm = parseFloat(toXlm(job.amount));

      if (statusFilter === "Active") {
        if (job.status === "Cancelled" || job.status === "Completed") return false;
      } else if (statusFilter !== "all" && job.status !== statusFilter) {
        return false;
      }

      if (minAmount !== "" && !Number.isNaN(parseFloat(minAmount))) {
        if (amountXlm < parseFloat(minAmount)) return false;
      }
      if (maxAmount !== "" && !Number.isNaN(parseFloat(maxAmount))) {
        if (amountXlm > parseFloat(maxAmount)) return false;
      }
      if (dateRange !== "all") {
        const threshold = dateThresholds[dateRange];
        if (threshold !== undefined && Number(job.created_at) < threshold) return false;
      }
      if (freelancerStatus === "unassigned" && job.freelancer) return false;
      if (freelancerStatus === "assigned" && !job.freelancer) return false;

      return true;
    });
  }, [advancedFilters, bookmarkedIds, getDescription, jobs, normalizedSearchTerm, showBookmarkedOnly, statusFilter]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleJobs.length / pageSize)),
    [pageSize, visibleJobs],
  );

  useEffect(() => {
    if (loading) return;
    const currentSignature = `${showBookmarkedOnly}:${normalizedSearchTerm}:${visibleJobs.map(({ id }) => id).join(",")}`;
    if (currentSignature === lastAnnouncedSignature) return;
    setResultsAnnouncement(
      `${visibleJobs.length} ${visibleJobs.length === 1 ? "result" : "results"} shown`,
    );
    setLastAnnouncedSignature(currentSignature);
  }, [lastAnnouncedSignature, loading, normalizedSearchTerm, showBookmarkedOnly, visibleJobs]);

  function markJobViewed(id: number) {
    setNewJobIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const handleAcceptJob = useCallback(
    async (id: number) => {
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
        addNotification("job_accepted", id, `You accepted Job #${id}.`);
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
    },
    [addNotification, refresh, wallet],
  );

  const toggleBookmark = useCallback((id: number) => {
    setAnimatingBookmarkId(id);
    setBookmarkedIds((prev) =>
      prev.includes(id)
        ? prev.filter((value) => value !== id)
        : [...prev, id],
    );
    setTimeout(() => setAnimatingBookmarkId(null), 300);
  }, []);

  const handleConfirmCancelJob = useCallback(async () => {
    if (!wallet || cancelTargetId === null) {
      return;
    }
    const id = cancelTargetId;
    setError(null);
    setCancelLoading(true);
    try {
      const result = await cancelJob(wallet, String(id));
      if (result.hash) {
        setLatestTxHash(result.hash);
      }
      addNotification("job_cancelled", id, `You cancelled Job #${id}.`);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to cancel job. Check your wallet or contract state.",
      );
    } finally {
      setCancelLoading(false);
      setCancelTargetId(null);
    }
  }, [addNotification, cancelTargetId, refresh, wallet]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = searchTerm.trim();
    if (!term) return;
    setRecentSearches((current) => updateRecentSearches(current ?? [], term));
    setRecentSearchesOpen(false);
    setPage(1);
  };

  const handleRecentSearchSelect = (term: string) => {
    setSearchTerm(term);
    setRecentSearches((current) => updateRecentSearches(current ?? [], term));
    setRecentSearchesOpen(false);
    setPage(1);
  };

  const handleRemoveRecentSearch = (term: string) => {
    setRecentSearches((current) => removeRecentSearch(current ?? [], term));
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setPage(1);
  };

  const handleClearSearchHistory = () => {
    setRecentSearches([]);
    setRecentSearchesOpen(false);
    clearRecentSearches();
  };

  const visibleNewJobCount = useMemo(
    () => visibleJobs.filter(({ id }) => newJobIds.has(id)).length,
    [newJobIds, visibleJobs],
  );
  const fiatTooltip = formatXlmFiatRateTooltip(fiatCurrency, fiatRates?.rates, fiatRates?.fetchedAt);

  return (
    <section className="space-y-6">
      <PullToRefresh onRefresh={refresh} label="Refresh job listings" />

      {/* Hero Section */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
              Find Your Next Opportunity
            </h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Browse open jobs or post your own project on the decentralized Stellar marketplace.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/post-job"
              className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 transition-colors text-center"
            >
              Post a Job
            </Link>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors text-center"
              disabled={loading}
          >
            {loading ? "Refreshing..." : "Browse Jobs"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Open Jobs</h2>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onRetry={() => void refresh()}
        />
      )}

      {loading && jobs.length === 0 && (
        <div className="space-y-4">
          <LoadingState text="Loading jobs..." />
          <div
            className={viewMode === "list" ? "flex flex-col gap-4" : "grid gap-4 md:grid-cols-2"}
            aria-label="Loading open jobs"
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <JobCardSkeleton key={index} compact={viewMode === "list"} />
            ))}
          </div>
        </div>
      )}

      {loading && jobs.length > 0 && (
        <p role="status" aria-live="polite" className="text-xs text-slate-400">
          Refreshing jobs…
        </p>
      )}

      {!loading && visibleNewJobCount > 0 && (
        <p role="status" className="text-xs font-medium text-emerald-700">
          {visibleNewJobCount} new job{visibleNewJobCount === 1 ? "" : "s"} since last refresh
        </p>
      )}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {resultsAnnouncement}
      </p>

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

      {!loading && visibleJobs.length === 0 && !error && (
        normalizedSearchTerm ? (
          <NoResultsState
            title="No jobs match your search"
            description="Try a different job description keyword or clear the search to see all open jobs."
            actionLabel="Clear search"
            onAction={handleClearSearch}
          />
        ) : showBookmarkedOnly && jobs.length > 0 ? (
          <NoResultsState
            title="No favorites found"
            description="No bookmarked jobs match the current feed. Turn off favorites only to see everything again."
            actionLabel="Show all jobs"
            onAction={() => setShowBookmarkedOnly(false)}
          />
        ) : (
          <EmptyState
            title={showBookmarkedOnly ? "No favorites found" : "No open jobs found"}
            description={
              showBookmarkedOnly
                ? "Bookmark jobs to quickly find them here."
                : "New jobs will appear here as clients post them."
            }
          />
        )
      )}

      <JobFilterPanel
        filters={advancedFilters}
        onChange={(f) => { setAdvancedFilters(f); setPage(1); }}
        resultCount={visibleJobs.length}
      />

      <SectionCard
        title="Jobs Display"
        description="Default sort is newest first."
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3">
          <label className="text-sm font-medium text-slate-700">
            Fiat currency
            <select
              value={fiatCurrency}
              onChange={(event) => setFiatCurrency(event.target.value as FiatCurrency)}
              className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
              title={fiatTooltip}
            >
              {FIAT_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          {fiatRateError && <p className="text-xs text-amber-700">{fiatRateError}</p>}
        </div>
        <form onSubmit={handleSearchSubmit} className="space-y-3 rounded-md border border-slate-200 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div
              className="relative flex-1 text-sm text-slate-600"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setRecentSearchesOpen(false);
                }
              }}
            >
              <label htmlFor="job-search" className="block font-medium text-slate-700">
                Search jobs
              </label>
              <input
                id="job-search"
                type="search"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                onFocus={() => setRecentSearchesOpen((recentSearches?.length ?? 0) > 0)}
                placeholder="Search by description keyword"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                aria-controls="recent-searches-listbox"
                aria-expanded={recentSearchesOpen}
                aria-haspopup="listbox"
              />
              {recentSearchesOpen && (recentSearches?.length ?? 0) > 0 && (
                <div className="absolute z-20 mt-2 w-full rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                  <div
                    id="recent-searches-listbox"
                    role="listbox"
                    aria-label="Recent searches"
                    className="space-y-1"
                  >
                    {(recentSearches ?? []).map((term) => (
                      <div
                        key={term}
                        role="option"
                        aria-selected={searchTerm.trim().toLowerCase() === term.toLowerCase()}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <button
                          type="button"
                          onClick={() => handleRecentSearchSelect(term)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                                                    <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-4 w-4 shrink-0 text-slate-400"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                          </svg>
                          <span className="truncate">{term}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveRecentSearch(term)}
                          className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          aria-label={`Remove ${term} from recent searches`}
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSearchHistory}
                    className="mt-2 w-full border-t border-slate-100 pt-2 text-left text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Clear history
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!searchTerm.trim()}
              >
                Search
              </button>
              <button
                type="button"
                onClick={handleClearSearch}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!searchTerm}
              >
                Clear
              </button>
            </div>
          </div>
        </form>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">Filter by status</legend>
          <div className="flex flex-wrap gap-2">
            {(["Open", "InProgress", "SubmittedForReview", "Completed", "Cancelled", "Disputed"] as JobStatus[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => { setStatusFilter(status); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === status
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {status === "SubmittedForReview" ? "Review" : status}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setStatusFilter("all"); setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === "all"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              All
            </button>
          </div>
        </fieldset>

        <div className="mt-4">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={totalJobs}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        </div>

        <fieldset className="space-y-3 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">
            Sort and filter job results
          </legend>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <div className="inline-flex items-center gap-2">
              <label htmlFor="jobs-sort-order">Sort:</label>
              <InfoTooltip
                label="Sort and filter jobs help"
                content="Newest first surfaces recent jobs at the top. Deadline ascending lists jobs with the closest deadline first. Favorites only filters to bookmarked jobs in this browser."
              />
            </div>
            <select
              id="jobs-sort-order"
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(event.target.value as SortOrder);
                setPage(1);
              }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1"
              disabled={loading}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="highest_amount">Highest amount</option>
              <option value="deadline_asc">Deadline ascending</option>
            </select>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showBookmarkedOnly}
                onChange={(event) => {
                  setShowBookmarkedOnly(event.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 rounded border-slate-300"
              />
              Favorites only
            </label>
          </div>
          <div
            className="flex flex-wrap items-center gap-2 text-sm text-slate-600"
            role="group"
            aria-label="Jobs layout"
          >
            <span className="font-medium text-slate-700">Layout:</span>
            <button
              type="button"
              className={`rounded-md border px-3 py-1 font-medium ${
                viewMode === "grid"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              aria-pressed={viewMode === "grid"}
              onClick={() => setViewMode("grid")}
            >
              Grid
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-1 font-medium ${
                viewMode === "list"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")}
            >
              List
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                localStorage.removeItem(BOOKMARK_STORAGE_KEY);
                sessionStorage.removeItem(VIEW_MODE_STORAGE_KEY);
                setBookmarkedIds([]);
                setViewMode("grid");
                setShowBookmarkedOnly(false);
                setSearchTerm("");
                setSortOrder("newest");
                setStatusFilter("Open");
                setAdvancedFilters(DEFAULT_FILTERS);
                setCompareIds([]);
                setPage(1);
              }}
            >
              Reset Preferences
            </button>
          </div>
        </fieldset>
      </SectionCard>

      <ul
        className={
          viewMode === "grid"
            ? "grid list-none gap-4 md:grid-cols-2"
            : "flex list-none flex-col gap-4"
        }
        aria-label="Open jobs"
      >
        {visibleJobs.slice((page - 1) * pageSize, page * pageSize).map(({ id, job }) => {
          const deadline = formatDeadline(job.deadline);

          // ✅ FIX: Check if the connected wallet is the job owner
          const isOwnJob = wallet && job.client && wallet === job.client;

          return (
            <li key={id}>
              <SwipeableJobCard
                jobId={id}
                canAccept={
                  job.status === "Open" && Boolean(wallet) && wallet !== job.client
                }
                canCancel={Boolean(
                  wallet && wallet === job.client && job.status === "Open",
                )}
                bookmarked={bookmarkedIds.includes(id)}
                disabled={actionLoading !== null || cancelLoading}
                onAccept={() => void handleAcceptJob(id)}
                onBookmark={() => toggleBookmark(id)}
                onCancel={() => setCancelTargetId(id)}
              >
              <article
                className={`interactive-card h-full p-4 ${
                  viewMode === "list"
                    ? "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
                    : ""
                }`}
              >
                <div className={viewMode === "list" ? "min-w-0 flex-1" : undefined}>
                  <div className="mb-1 flex items-start gap-2">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={compareIds.includes(id)}
                        onChange={() => toggleCompare(id)}
                        disabled={!compareIds.includes(id) && compareIds.length >= MAX_COMPARE_JOBS}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                        aria-label={`Select Job #${id} for comparison`}
                      />
                      Compare
                    </label>
                    {isOwnJob && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                        Your Job
                      </span>
                    )}
                  </div>
                  <Link href={`/job/${id}`} className="block" onClick={() => markJobViewed(id)}>
                    <h3 className="flex items-center gap-2 text-lg font-medium hover:underline">
                      Job #{id}
                      {newJobIds.has(id) && (
                        <span
                          aria-hidden="true"
                          className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                        >
                          New
                        </span>
                      )}
                    </h3>
                  </Link>
                  {job.category && (
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {job.category}
                    </span>
                  )}
                  <p
                    className="mt-2 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold tabular-nums text-slate-700"
                    title={fiatTooltip}
                  >
                    {formatXlmWithFiat(job.amount, fiatCurrency, fiatRates?.rates)}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-slate-400">
                    Token:{" "}
                    {job.token ? (
                      <TruncatedAddress address={job.token} className="font-mono text-xs text-slate-400" />
                    ) : (
                      "N/A"
                    )}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-700">
                    {getDescription(job.description_hash)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Hash: {job.description_hash.slice(0, 12)}...
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {deadline
                      ? `Deadline: ${deadline.isPast ? "Past due" : deadline.relative} • ${deadline.exact}`
                      : "Deadline: No deadline"}
                  </p>
                  <div className="mt-2">
                    <ClientReputationBadge clientAddress={job.client} />
                  </div>
                </div>
                <div
                  className={`flex flex-wrap items-center gap-2 ${
                    viewMode === "list" ? "sm:shrink-0 sm:flex-col sm:items-stretch" : "mt-4"
                  }`}
                >
                  <Link
                    href={`/job/${id}`}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => markJobViewed(id)}
                  >
                    View Details
                  </Link>
                  {/* ✅ FIX: Only show "Accept Job" button if NOT the job owner */}
                  {!isOwnJob ? (
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
                          addNotification("job_accepted", id, `You accepted Job #${id}.`);
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
                  ) : (
                    <span className="rounded-md px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed">
                      Own Job
                    </span>
                  )}
                  <button
                    type="button"
                    className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                      !wallet || actionLoading === id
                        ? "cursor-not-allowed bg-slate-100 text-slate-400"
                        : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
                    }`}
                    title={!wallet ? "Connect your wallet to accept jobs." : undefined}
                    onClick={() => void handleAcceptJob(id)}
                    disabled={!wallet || actionLoading !== null}
                    aria-busy={actionLoading === id}
                  >
                    {actionLoading === id ? "Processing..." : "Accept Job"}
                  </button>
                  <button
                    type="button"
                    className={`rounded-md border px-4 py-2 text-sm font-medium transition-all duration-300 ${
                      bookmarkedIds.includes(id)
                        ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50"
                    } ${animatingBookmarkId === id ? "scale-110" : "scale-100"}`}
                    onClick={() => toggleBookmark(id)}
                    aria-pressed={bookmarkedIds.includes(id)}
                  >
                    {bookmarkedIds.includes(id) ? "★ Saved" : "☆ Save"}
                  </button>
                </div>
                {!wallet && (
                  <p className="mt-2 text-xs text-amber-700">
                    Connect your wallet to enable job actions.
                  </p>
                )}
              </article>
              </SwipeableJobCard>
            </li>
          );
        })}
      </ul>

      {visibleJobs.length > 0 && (
        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <fieldset className="flex items-center gap-2 text-sm text-slate-600">
            <legend className="sr-only">Pagination settings</legend>
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
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </fieldset>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={loading || page <= 1}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Comparison bar — fixed to bottom when jobs are selected */}
      {compareIds.length > 0 && (
        <div className="pb-20" aria-hidden="true" />
      )}
      <ComparisonBar
        selectedIds={compareIds}
        onRemove={(id) => setCompareIds((prev) => prev.filter((v) => v !== id))}
        onClear={() => setCompareIds([])}
      />

      {cancelTargetId !== null && (
        <CancelJobConfirmModal
          jobId={String(cancelTargetId)}
          loading={cancelLoading}
          onClose={() => {
            if (!cancelLoading) {
              setCancelTargetId(null);
            }
          }}
          onConfirm={() => void handleConfirmCancelJob()}
        />
      )}
    </section>
  );
}