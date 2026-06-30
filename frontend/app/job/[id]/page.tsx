"use client";

import ConfirmDialog from "@/components/ConfirmDialog";
import InfoTooltip from "@/components/InfoTooltip";
import LoadingState from "@/components/LoadingState";
import { useToast } from "@/components/ToastProvider";
import StatusPill from "@/components/StatusPill";
import ShareButton from "@/components/ShareButton";
import RichTextRenderer, { isRichText, PlainTextRenderer } from "@/components/RichTextRenderer";
import { useNotifications } from "@/lib/notifications-context";
import { acceptJob, approveWork, cancelJob, freelancerCancelJob, getDescriptionCid, getJob, submitWork } from "@/lib/contract";
import { fetchFromIpfs } from "@/lib/ipfs-service";
import {
  fetchXlmFiatRates,
  formatDeadline,
  formatXlmFiatRateTooltip,
  formatXlmWithFiat,
  getCachedXlmFiatRates,
  getPreferredFiatCurrency,
  type FiatCurrency,
  type XlmFiatRateCache,
} from "@/lib/format";
import { getExplorerTxUrl } from "@/lib/stellar";
import { isConfirmSuppressed, CONFIRM_KEYS } from "@/lib/confirm-prefs";
import type { Job } from "@/lib/types";
import { useWallet } from "@/lib/wallet-context";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
type PendingAction = "cancelJob" | "approveWork" | "submitWork" | "freelancerCancelJob";

const BOOKMARK_STORAGE_KEY = "stellarwork:bookmarked-jobs";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { wallet } = useWallet();
  const { showSuccess, showError } = useToast();
  const { addNotification } = useNotifications();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [fetching, setFetching] = useState(true);
  const [latestTxHash, setLatestTxHash] = useState<string | null>(null);
  const [invalidId, setInvalidId] = useState(false);
  const [copied, setCopied] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [fiatCurrency, setFiatCurrency] = useState<FiatCurrency>("USD");
  const [fiatRates, setFiatRates] = useState<XlmFiatRateCache | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkAnimating, setBookmarkAnimating] = useState(false);

  const numericId = Number(id);
  const isIdValid = !isNaN(numericId) && numericId > 0 && Number.isInteger(numericId);

  async function load() {
    if (!isIdValid) {
      setInvalidId(true);
      setFetching(false);
      return;
    }
    setFetching(true);
    setError(null);
    setDescription(null);
    try {
      const data = await getJob(id);
      setJob(data);
      if (data) {
        const hash = data.description_hash;
        const stored = localStorage.getItem(`job-desc:${hash}`);
        if (stored) {
          setDescription(stored);
        } else {
          try {
            const cid = await getDescriptionCid(hash);
            if (cid) {
              const text = await fetchFromIpfs(cid);
              setDescription(text);
              localStorage.setItem(`job-desc:${hash}`, text);
            }
          } catch {
            setDescription(null);
          }
        }
      } else {
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BOOKMARK_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return;
      setIsBookmarked(parsed.map(Number).includes(numericId));
    } catch {
      // Ignore
    }
  }, [numericId]);

  useEffect(() => {
    setFiatCurrency(getPreferredFiatCurrency());
    setFiatRates(getCachedXlmFiatRates());
    let cancelled = false;

    fetchXlmFiatRates()
      .then((cache) => {
        if (!cancelled) setFiatRates(cache);
      })
      .catch(() => {
        if (!cancelled) setFiatRates(getCachedXlmFiatRates());
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!wallet) {
      setError(null);
      setLatestTxHash(null);
      setPendingAction(null);
    }
  }, [wallet]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const isClient = wallet && job && wallet === job.client;
  const isFreelancer = wallet && job && wallet === job.freelancer;
  const canAccept = Boolean(job && job.status === "Open");
  const canSubmit = Boolean(isFreelancer && job?.status === "InProgress");
  const canApprove = Boolean(isClient && job?.status === "SubmittedForReview");
  const canCancel = Boolean(isClient && job?.status === "Open");
  const canFreelancerCancel = Boolean(isFreelancer && job?.status === "InProgress");
  const hasPrimaryActions = canAccept || canSubmit || canApprove || canCancel || canFreelancerCancel;

  async function handleAction(
    action: () => Promise<{ hash?: string }>,
    successMessage = "Action completed successfully.",
    notification?: { event: import("@/lib/types").NotificationEvent; message: string },
  ) {
    if (loading) return;
    setError(null);
    if (!wallet) {
      showError("Connect your wallet to run this action.");
      return;
    }

    setLoading(true);

    try {
      const result = await action();
      if (result.hash) {
        setLatestTxHash(result.hash);
      }
      if (notification) {
        addNotification(notification.event, numericId, notification.message);
      }
      await load();
      showSuccess(successMessage);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Transaction failed.";
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }

  /** Request a confirmed action. If the user has suppressed the dialog, execute immediately. */
  function requestAction(action: PendingAction) {
    const keyMap: Record<PendingAction, string> = {
      cancelJob: CONFIRM_KEYS.cancelJob,
      approveWork: CONFIRM_KEYS.approveWork,
      submitWork: CONFIRM_KEYS.submitWork,
      freelancerCancelJob: CONFIRM_KEYS.freelancerCancelJob,
    };
    if (isConfirmSuppressed(keyMap[action])) {
      void executeAction(action);
    } else {
      setPendingAction(action);
    }
  }

  async function executeAction(action: PendingAction) {
    setPendingAction(null);
    if (!wallet) return;
    switch (action) {
      case "cancelJob":
        await handleAction(
          () => cancelJob(wallet, id),
          "Job cancelled and funds refunded.",
          { event: "job_cancelled", message: `Job #${id} was cancelled and funds refunded.` },
        );
        break;
      case "approveWork":
        await handleAction(
          () => approveWork(wallet, id),
          "Work approved and payment released.",
          { event: "work_approved", message: `Work for Job #${id} was approved and payment released.` },
        );
        break;
      case "submitWork":
        await handleAction(
          () => submitWork(wallet, id),
          "Work submitted for review.",
          { event: "work_submitted", message: `Work for Job #${id} was submitted for review.` },
        );
        break;
      case "freelancerCancelJob":
        await handleAction(
          () => freelancerCancelJob(wallet, id),
          "Job cancelled. Full refund returned to client.",
        );
        break;
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      setCopied(true);
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  }

  function toggleBookmark() {
    setBookmarkAnimating(true);
    try {
      const stored = localStorage.getItem(BOOKMARK_STORAGE_KEY);
      let ids: number[] = [];
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) {
          ids = parsed.map(Number).filter((v) => Number.isInteger(v) && v > 0);
        }
      }
      if (ids.includes(numericId)) {
        ids = ids.filter((v) => v !== numericId);
      } else {
        ids.push(numericId);
      }
      if (ids.length === 0) {
        localStorage.removeItem(BOOKMARK_STORAGE_KEY);
      } else {
        localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(ids));
      }
      setIsBookmarked(ids.includes(numericId));
    } finally {
      setTimeout(() => setBookmarkAnimating(false), 300);
    }
  }

  // ── Confirm dialog configs ──────────────────────────────────────────────

  const amountXlm = job ? formatXlmWithFiat(job.amount, fiatCurrency, fiatRates?.rates) : "";
  const fiatTooltip = formatXlmFiatRateTooltip(fiatCurrency, fiatRates?.rates, fiatRates?.fetchedAt);

  const DIALOG_CONFIG: Record<
    PendingAction,
    {
      title: string;
      description: string;
      consequences?: string[];
      impactLine?: string;
      confirmLabel: string;
      variant: "danger" | "warning" | "primary";
      suppressKey: (typeof CONFIRM_KEYS)[keyof typeof CONFIRM_KEYS];
    }
  > = {
    cancelJob: {
      title: "Cancel this job?",
      description: "Cancelling will close the job and return the escrowed funds to your wallet. This action cannot be undone.",
      consequences: [
        "The job will move to Cancelled status permanently.",
        "The freelancer (if any) will lose access to the job.",
      ],
      impactLine: `${amountXlm} will be refunded to your wallet`,
      confirmLabel: "Yes, cancel job",
      variant: "danger",
      suppressKey: CONFIRM_KEYS.cancelJob,
    },
    approveWork: {
      title: "Approve and release payment?",
      description: "Approving the submitted work releases the escrowed funds to the freelancer minus the platform fee. This action is final and cannot be reversed.",
      consequences: [
        "The job will move to Completed status permanently.",
        "You will not be able to request changes after approval.",
        "Platform fee (2.5%) will be deducted before transfer.",
      ],
      impactLine: `${amountXlm} (minus 2.5% fee) will be released to the freelancer`,
      confirmLabel: "Yes, approve & pay",
      variant: "primary",
      suppressKey: CONFIRM_KEYS.approveWork,
    },
    submitWork: {
      title: "Submit work for review?",
      description: "Submitting notifies the client that your work is ready for review. This action cannot be undone — you will not be able to make further changes until the client responds.",
      consequences: [
        "The job will move to Submitted for Review status.",
        "The client will be able to approve or raise a dispute.",
      ],
      confirmLabel: "Yes, submit work",
      variant: "warning",
      suppressKey: CONFIRM_KEYS.submitWork,
    },
    freelancerCancelJob: {
      title: "Cancel this job?",
      description: "Cancelling as a freelancer will return the full escrowed amount to the client. This action cannot be undone.",
      consequences: [
        "The job will move to Cancelled status permanently.",
        "The full escrow amount is refunded to the client.",
        "Your reputation may be affected.",
      ],
      impactLine: `${amountXlm} will be refunded to the client`,
      confirmLabel: "Yes, cancel job",
      variant: "danger",
      suppressKey: CONFIRM_KEYS.freelancerCancelJob,
    },
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (invalidId) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Invalid Job ID</h1>
        <p className="text-sm text-red-700" role="alert">
          Invalid job ID. Please check the URL and try again.
        </p>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          Back to Home
        </Link>
      </section>
    );
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
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm">
          <p className="text-slate-700">{error ?? "Job not found."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {error && error !== "Job not found." && (
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
              >
                Retry
              </button>
            )}
            <Link href="/" className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50">
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 pb-6 sm:pb-6">
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
        <div className="flex items-center justify-between gap-2">
          <p>
            <strong>Status:</strong> <StatusPill status={job.status} />
          </p>
          <div className="flex items-center gap-2">
            <ShareButton
              jobId={id}
              jobTitle={`Job #${id}`}
              jobAmount={formatXlmWithFiat(job.amount, fiatCurrency, fiatRates?.rates)}
            />
            <button
            type="button"
            onClick={toggleBookmark}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
              isBookmarked
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            } ${bookmarkAnimating ? "scale-110" : "scale-100"}`}
            aria-pressed={isBookmarked}
            title={isBookmarked ? "Remove bookmark" : "Bookmark this job"}
          >
            {isBookmarked ? "★ Saved" : "☆ Save"}
          </button>
          </div>
        </div>
        <p>
          <strong>Client:</strong> {job.client}
        </p>
        <p>
          <strong>Freelancer:</strong>{" "}
          {job.freelancer ? (
            <Link href={`/profile/${job.freelancer}`} className="font-mono text-blue-600 hover:underline text-sm">
              {job.freelancer}
            </Link>
          ) : (
            "Not assigned"
          )}
        </p>
        <p title={fiatTooltip}>
          <strong>Amount:</strong> {formatXlmWithFiat(job.amount, fiatCurrency, fiatRates?.rates)}
        </p>
        <p>
          <strong>Token:</strong>{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
            {job.token ? `${job.token.slice(0, 8)}...${job.token.slice(-4)}` : "N/A"}
          </code>
        </p>
        <div>
          <strong className="text-sm">Description:</strong>{" "}
          {(() => {
            const content =
              description ??
              localStorage.getItem(`job-desc:${job.description_hash}`) ??
              null;
            if (!content) {
              return (
                <span className="text-sm text-slate-500 italic">
                  Description unavailable (posted from another device)
                </span>
              );
            }
            return isRichText(content) ? (
              <RichTextRenderer html={content} className="mt-1" />
            ) : (
              <PlainTextRenderer text={content} className="mt-1" />
            );
          })()}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-2">
            <strong className="inline-flex items-center gap-2">
              Description hash
              <InfoTooltip
                label="Description hash help"
                content="This hash identifies the stored job description and is useful when comparing records across devices."
              />
              :
            </strong>
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
              {job.description_hash}
            </code>
          </p>
          <button
            onClick={() => void copyToClipboard(job.description_hash)}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 active:bg-slate-200"
            title="Copy hash to clipboard"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p>
          <strong>Deadline:</strong>{" "}
          {(() => {
            const deadline = formatDeadline(job.deadline);
            if (!deadline) return "No deadline";
            return `${deadline.isPast ? "Past due" : deadline.relative} • ${deadline.exact}`;
          })()}
        </p>

        {/* Message button — visible when the other party is known */}
        {wallet && (() => {
          const otherParty =
            wallet === job.client ? job.freelancer :
            wallet === job.freelancer ? job.client :
            // Visitor: can message the client
            job.client;
          if (!otherParty || otherParty === wallet) return null;
          return (
            <div className="pt-1">
              <Link
                href={`/messages/${otherParty}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 10c0 2.21-2.686 4-6 4a7.232 7.232 0 01-3.115-.674L2 14l.897-2.392A3.954 3.954 0 012 10c0-2.21 2.686-4 6-4s6 1.79 6 4z" />
                </svg>
                Message {wallet === job.client ? "Freelancer" : wallet === job.freelancer ? "Client" : "Client"}
              </Link>
            </div>
          );
        })()}

        {!wallet && (
          <p className="text-xs text-amber-700">
            Connect your wallet to enable contract actions.
          </p>
        )}
      </article>

      {hasPrimaryActions && (
        <>
          {/* Spacer on mobile to prevent content hiding behind sticky footer */}
          <div className="h-20 sm:hidden" aria-hidden="true" />

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:pb-0 sm:shadow-none sm:backdrop-blur-none">
            <div className="mx-auto flex w-full max-w-4xl flex-wrap gap-2 sm:justify-end">
              {canAccept && (
                <button
                  className="min-w-0 flex-1 rounded-md border border-blue-600 bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 sm:flex-none sm:max-w-48 sm:py-2"
                  onClick={() => {
                    if (!wallet) return;
                    void handleAction(
                      () => acceptJob(wallet, id),
                      "Job accepted successfully.",
                      { event: "job_accepted", message: `You accepted Job #${id}.` },
                    );
                  }}
                  disabled={!wallet || loading}
                  title={!wallet ? "Connect your wallet to accept this job." : undefined}
                  aria-busy={loading}
                >
                  <span className="block truncate">{loading ? "Processing..." : "Accept Job"}</span>
                </button>
              )}

              {canSubmit && (
                <button
                  className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:flex-none sm:max-w-48 sm:py-2"
                  onClick={() => requestAction("submitWork")}
                  disabled={loading}
                  aria-haspopup="dialog"
                  aria-busy={loading}
                >
                  <span className="block truncate">{loading ? "Processing..." : "Submit Work"}</span>
                </button>
              )}

              {canApprove && (
                <button
                  className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:flex-none sm:max-w-48 sm:py-2"
                  onClick={() => requestAction("approveWork")}
                  disabled={loading}
                  aria-haspopup="dialog"
                  aria-busy={loading}
                >
                  <span className="block truncate">{loading ? "Processing..." : "Approve Work"}</span>
                </button>
              )}

              {canCancel && (
                <button
                  className="min-w-0 flex-1 rounded-md border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:flex-none sm:max-w-48 sm:py-2"
                  onClick={() => requestAction("cancelJob")}
                  disabled={loading}
                  aria-haspopup="dialog"
                >
                  <span className="block truncate">Cancel Job</span>
                </button>
              )}

              {canFreelancerCancel && (
                <button
                  className="min-w-0 flex-1 rounded-md border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:flex-none sm:max-w-48 sm:py-2"
                  onClick={() => requestAction("freelancerCancelJob")}
                  disabled={loading}
                  aria-haspopup="dialog"
                  aria-busy={loading}
                >
                  <span className="block truncate">{loading ? "Processing..." : "Cancel as Freelancer"}</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Confirmation dialogs */}
      {pendingAction && (
        <ConfirmDialog
          open={pendingAction !== null}
          {...DIALOG_CONFIG[pendingAction]}
          loading={loading}
          onConfirm={() => void executeAction(pendingAction)}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </section>
  );
}
