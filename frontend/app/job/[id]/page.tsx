"use client";

import CancelJobConfirmModal from "@/components/CancelJobConfirmModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import InfoTooltip from "@/components/InfoTooltip";
import { useToast } from "@/components/ToastProvider";
import StatusPill from "@/components/StatusPill";
import ShareButton from "@/components/ShareButton";
import RichTextRenderer, {
  isRichText,
  PlainTextRenderer,
} from "@/components/RichTextRenderer";
import TruncatedAddress from "@/components/TruncatedAddress";
import RichTextRenderer, { isRichText, PlainTextRenderer } from "@/components/RichTextRenderer";
import { verifyHtmlMatchesHash } from "@/lib/crypto";
import { useNotifications } from "@/lib/notifications-context";
import {
  acceptJob,
  approveWork,
  cancelJob,
  freelancerCancelJob,
  getDescriptionCid,
  getJob,
  submitWork,
} from "@/lib/contract";
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
import { getExplorerTxUrl, parseContractError, getNativeBalance } from "@/lib/stellar";
import { isConfirmSuppressed, CONFIRM_KEYS } from "@/lib/confirm-prefs";
import type { Job } from "@/lib/types";
import { useWallet } from "@/lib/wallet-context";
import { useMeetings } from "@/lib/meetings-context";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import JobDetailPageSkeleton from "@/components/JobDetailPageSkeleton";
type PendingAction =
  | "cancelJob"
  | "approveWork"
  | "submitWork"
  | "freelancerCancelJob";

const BOOKMARK_STORAGE_KEY = "stellarwork:bookmarked-jobs";

function getAutoApprovalCountdown(submittedAtStr: string | undefined) {
  if (!submittedAtStr) return null;
  const submittedAtNum = Number(submittedAtStr);
  if (!submittedAtNum || isNaN(submittedAtNum)) return null;

  const APPROVAL_WINDOW = 14 * 24 * 60 * 60; // 14 days in seconds
  const autoApproveTime = (submittedAtNum + APPROVAL_WINDOW) * 1000;
  const now = Date.now();
  const diff = autoApproveTime - now;

  if (diff <= 0) {
    return {
      expired: true,
      text: "The 14-day approval window has expired. Payment can now be automatically released to the freelancer.",
    };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  let timeStr = "";
  if (days > 0) {
    timeStr += `${days} day${days > 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    if (timeStr) timeStr += ", ";
    timeStr += `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  if (days === 0 && minutes > 0) {
    if (timeStr) timeStr += ", ";
    timeStr += `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }

  return {
    expired: false,
    text: `Payment will be automatically released to the freelancer in ${timeStr} if you do not take action.`,
  };
}

function JobDetailPageContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { wallet, connectWallet } = useWallet();
  const { showSuccess, showError } = useToast();
  const { addNotification } = useNotifications();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
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
  const [statusAnnouncement, setStatusAnnouncement] = useState("");
  const { proposeMeeting, getMeetingsForJob } = useMeetings();
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [slotDate, setSlotDate] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");

  const numericId = Number(id);
  const isIdValid =
    !isNaN(numericId) && numericId > 0 && Number.isInteger(numericId);

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
          try {
            const ok = await verifyHtmlMatchesHash(stored, hash);
            if (ok) {
              setDescription(stored);
            } else {
              // Integrity mismatch — ignore stored value
              setDescription(null);
            }
          } catch {
            setDescription(null);
          }
        } else {
          try {
            const cid = await getDescriptionCid(hash);
            if (cid) {
              const text = await fetchFromIpfs(cid);
              const ok = await verifyHtmlMatchesHash(text, hash);
              if (ok) {
                setDescription(text);
                localStorage.setItem(`job-desc:${hash}`, text);
              } else {
                setDescription(null);
              }
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
  const canFreelancerCancel = Boolean(
    isFreelancer && job?.status === "InProgress",
  );
  const hasPrimaryActions =
    canAccept || canSubmit || canApprove || canCancel || canFreelancerCancel;
  const canFreelancerCancel = Boolean(isFreelancer && job?.status === "InProgress");
  const hasPrimaryActions = !wallet
    ? Boolean(job && ["Open", "InProgress", "SubmittedForReview"].includes(job.status))
    : canAccept || canSubmit || canApprove || canCancel || canFreelancerCancel;

  async function handleAction(
    action: () => Promise<{ hash?: string }>,
    successMessage = "Action completed successfully.",
    notification?: {
      event: import("@/lib/types").NotificationEvent;
      message: string;
    },
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
      setStatusAnnouncement(successMessage);
    } catch (e) {
      // Fetch current balance to include in insufficient-balance messages (#620)
      let balance: string | undefined;
      if (wallet) {
        try {
          balance = await getNativeBalance(wallet);
        } catch {
          // Balance fetch failed — parseContractError will omit the balance detail
        }
      }
      const message = parseContractError(e, balance);
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
          {
            event: "job_cancelled",
            message: `Job #${id} was cancelled and funds refunded.`,
          },
        );
        break;
      case "approveWork":
        await handleAction(
          () => approveWork(wallet, id),
          "Work approved and payment released.",
          {
            event: "work_approved",
            message: `Work for Job #${id} was approved and payment released.`,
          },
        );
        break;
      case "submitWork":
        await handleAction(
          () => submitWork(wallet, id),
          "Work submitted for review.",
          {
            event: "work_submitted",
            message: `Work for Job #${id} was submitted for review.`,
          },
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

  const amountXlm = job
    ? formatXlmWithFiat(job.amount, fiatCurrency, fiatRates?.rates)
    : "";
  const fiatTooltip = formatXlmFiatRateTooltip(
    fiatCurrency,
    fiatRates?.rates,
    fiatRates?.fetchedAt,
  );

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
      description:
        "Cancelling will close the job and return the escrowed funds to your wallet. This action cannot be undone.",
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
      description:
        "Approving the submitted work releases the escrowed funds to the freelancer minus the platform fee. This action is final and cannot be reversed.",
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
      description:
        "Submitting notifies the client that your work is ready for review. This action cannot be undone — you will not be able to make further changes until the client responds.",
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
      description:
        "Cancelling as a freelancer will return the full escrowed amount to the client. This action cannot be undone.",
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
    return <JobDetailPageSkeleton />;
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
            <Link
              href="/"
              className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 pb-6 sm:pb-6">
      {/* Screen reader announcer for job status transitions */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {statusAnnouncement}
      </p>

      <div className="flex items-center gap-4">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          Back
        </Link>
        <h1 className="text-2xl font-semibold">
          {job.title || `Job #${id}`}
        </h1>
        {job.category && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {job.category}
          </span>
        )}
      </div>

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="rounded-md bg-red-100 p-3 text-sm text-red-700"
        >
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

      {job.status === "SubmittedForReview" && (() => {
        const countdown = getAutoApprovalCountdown(job.submitted_at);
        if (!countdown) return null;
        return (
          <div className={`rounded-lg border p-4 text-sm ${
            countdown.expired
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}>
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h2 className="font-semibold">{isClient ? "Action Required: Review Submitted Work" : "Work Under Review"}</h2>
                <p className="mt-1 text-xs opacity-90">{countdown.text}</p>
      {job.status === "SubmittedForReview" &&
        (() => {
          const countdown = getAutoApprovalCountdown(job.submitted_at);
          if (!countdown) return null;
          return (
            <div
              className={`rounded-lg border p-4 text-sm ${
                countdown.expired
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <div className="flex items-start gap-3">
                <svg
                  className="h-5 w-5 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <h4 className="font-semibold">
                    {isClient
                      ? "Action Required: Review Submitted Work"
                      : "Work Under Review"}
                  </h4>
                  <p className="mt-1 text-xs opacity-90">{countdown.text}</p>
                </div>
              </div>
            </div>
          );
        })()}

      <article className="space-y-2 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <p>
            <strong>Status:</strong> <StatusPill status={job.status} />
          </p>
          <div className="flex items-center gap-2">
            <ShareButton
              jobId={id}
              jobTitle={`Job #${id}`}
              jobAmount={formatXlmWithFiat(
                job.amount,
                fiatCurrency,
                fiatRates?.rates,
              )}
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
            <Link
              href={`/profile/${job.freelancer}`}
              className="font-mono text-blue-600 hover:underline text-sm"
            >
              {job.freelancer}
            </Link>
          ) : (
            "Not assigned"
          )}
        </p>
        <p title={fiatTooltip}>
          <strong>Amount:</strong>{" "}
          {formatXlmWithFiat(job.amount, fiatCurrency, fiatRates?.rates)}
        </p>
        <p>
          <strong>Token:</strong>{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
            {job.token
              ? `${job.token.slice(0, 8)}...${job.token.slice(-4)}`
              : "N/A"}
            {job.token ? (
              <TruncatedAddress address={job.token} className="font-mono text-xs" />
            ) : (
              "N/A"
            )}
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
        {wallet &&
          (() => {
            const otherParty =
              wallet === job.client
                ? job.freelancer
                : wallet === job.freelancer
                  ? job.client
                  : job.client;
            if (!otherParty || otherParty === wallet) return null;
            return (
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href={`/messages/${otherParty}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 16 16"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14 10c0 2.21-2.686 4-6 4a7.232 7.232 0 01-3.115-.674L2 14l.897-2.392A3.954 3.954 0 012 10c0-2.21 2.686-4 6-4s6 1.79 6 4z"
                    />
                  </svg>
                  Message{" "}
                  {wallet === job.client
                    ? "Freelancer"
                    : wallet === job.freelancer
                      ? "Client"
                      : "Client"}
                </Link>
                <button
                  type="button"
                  onClick={() => setShowScheduleForm(!showScheduleForm)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                    />
                  </svg>
                  {showScheduleForm ? "Cancel" : "Schedule Meeting"}
                </button>
              </div>
            );
          })()}

        {/* Schedule meeting form */}
        {showScheduleForm && wallet && (() => {
          const otherParty =
            wallet === job.client ? job.freelancer :
            wallet === job.freelancer ? job.client :
            job.client;
          if (!otherParty) return null;
          return (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <h2 className="font-medium text-slate-800 mb-3">Propose a Meeting</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Meeting title</label>
                  <input
                    type="text"
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                    placeholder="e.g. Project kickoff call"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
        {showScheduleForm &&
          wallet &&
          (() => {
            const otherParty =
              wallet === job.client
                ? job.freelancer
                : wallet === job.freelancer
                  ? job.client
                  : job.client;
            if (!otherParty) return null;
            return (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <h4 className="font-medium text-slate-800 mb-3">
                  Propose a Meeting
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Meeting title
                    </label>
                    <input
                      type="text"
                      value={meetingTitle}
                      onChange={(e) => setMeetingTitle(e.target.value)}
                      placeholder="e.g. Project kickoff call"
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Date
                      </label>
                      <input
                        type="date"
                        value={slotDate}
                        onChange={(e) => setSlotDate(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Start time
                      </label>
                      <input
                        type="time"
                        value={slotStart}
                        onChange={(e) => setSlotStart(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        End time
                      </label>
                      <input
                        type="time"
                        value={slotEnd}
                        onChange={(e) => setSlotEnd(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={
                      !meetingTitle || !slotDate || !slotStart || !slotEnd
                    }
                    onClick={() => {
                      const start = `${slotDate}T${slotStart}:00`;
                      const end = `${slotDate}T${slotEnd}:00`;
                      proposeMeeting(
                        numericId,
                        meetingTitle,
                        [{ start, end }],
                        wallet,
                        otherParty,
                      );
                      setMeetingTitle("");
                      setSlotDate("");
                      setSlotStart("");
                      setSlotEnd("");
                      setShowScheduleForm(false);
                    }}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send Proposal
                  </button>
                </div>
              </div>
            );
          })()}

        {/* Show existing meetings for this job */}
        {wallet && (() => {
          const jobMeetings = getMeetingsForJob(numericId);
          if (jobMeetings.length === 0) return null;
          return (
            <div className="mt-3 space-y-2">
              <h2 className="text-xs font-medium text-slate-600 uppercase tracking-wider">Meetings</h2>
              {jobMeetings.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
                  <div>
                    <span className="font-medium text-slate-800">{m.title}</span>
                    <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      m.status === "confirmed" ? "bg-green-100 text-green-700" :
                      m.status === "pending" ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-500"
                    }`}>
                      {m.status}
                    </span>
        {wallet &&
          (() => {
            const jobMeetings = getMeetingsForJob(numericId);
            if (jobMeetings.length === 0) return null;
            return (
              <div className="mt-3 space-y-2">
                <h4 className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Meetings
                </h4>
                {jobMeetings.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-slate-800">
                        {m.title}
                      </span>
                      <span
                        className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          m.status === "confirmed"
                            ? "bg-green-100 text-green-700"
                            : m.status === "pending"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>
                    <Link
                      href="/meetings"
                      className="text-blue-600 hover:underline"
                    >
                      View
                    </Link>
                  </div>
                ))}
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
              {!wallet ? (
                <button
                  className="min-w-0 flex-1 rounded-md border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 sm:flex-none sm:max-w-48 sm:py-2"
                  onClick={async () => {
                    try { await connectWallet(); } catch { /* cancelled */ }
                  }}
                >
                  Connect Wallet
                </button>
              ) : (
                <>
                  {canAccept && (
                <button
                  className="min-w-0 flex-1 rounded-md border border-blue-600 bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 sm:flex-none sm:max-w-48 sm:py-2"
                  onClick={() => {
                    if (!wallet) return;
                    void handleAction(
                      () => acceptJob(wallet, id),
                      "Job accepted successfully.",
                      {
                        event: "job_accepted",
                        message: `You accepted Job #${id}.`,
                      },
                    );
                  }}
                  disabled={!wallet || loading}
                  title={
                    !wallet
                      ? "Connect your wallet to accept this job."
                      : undefined
                  }
                  aria-busy={loading}
                >
                  <span className="block truncate">
                    {loading ? "Processing..." : "Accept Job"}
                  </span>
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
                  <span className="block truncate">
                    {loading ? "Processing..." : "Submit Work"}
                  </span>
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
                  <span className="block truncate">
                    {loading ? "Processing..." : "Approve Work"}
                  </span>
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
                  <span className="block truncate">
                    {loading ? "Processing..." : "Cancel as Freelancer"}
                  </span>
                </button>
              )}
              )}
            </div>
          </div>
        </>
      )}

      {/* Confirmation dialogs */}
      {pendingAction === "cancelJob" ? (
        <CancelJobConfirmModal
          jobId={id}
          loading={loading}
          onClose={() => setPendingAction(null)}
          onConfirm={() => void executeAction("cancelJob")}
        />
      ) : pendingAction !== null ? (
        <ConfirmDialog
          open
          {...DIALOG_CONFIG[pendingAction]}
          loading={loading}
          onConfirm={() => void executeAction(pendingAction)}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}
    </section>
  );
}

export default function JobDetailPage() {
  return (
    <Suspense fallback={<JobDetailPageSkeleton />}>
      <JobDetailPageContent />
    </Suspense>
  );
}
