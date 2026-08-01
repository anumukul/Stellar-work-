"use client";

import { getDescPayloadMax, postJob, storeDescriptionCid } from "@/lib/contract";
import { uploadToIpfs } from "@/lib/ipfs-service";
import ErrorBanner from "@/components/ErrorBanner";
import RichTextEditor, { htmlToPlainText } from "@/components/RichTextEditor";
import { getExplorerTxUrl } from "@/lib/stellar";
import { useWallet } from "@/lib/wallet-context";
import { useEffect, useId, useRef, useState } from "react";
import {
  getRateLimitStatus,
  recordPostJob,
  formatCooldown,
  type RateLimitStatus,
} from "@/lib/rate-limiter";
import {
  validateAmount,
  validateAmountMin,
  validateDeadline,
  validateTokenAddress,
  MIN_JOB_AMOUNT_STROOPS,
} from "@/lib/sanitize";

const MIN_JOB_AMOUNT_XLM = 0.5;
const DRAFT_STORAGE_KEY_PREFIX = "stellarwork:post-job-draft:";

interface DraftData {
  amount: string;
  description: string;
  deadline: string;
  tokenAddress: string;
  savedAt: number;
}

function getDraftKey(walletAddress: string | null): string {
  return `${DRAFT_STORAGE_KEY_PREFIX}${walletAddress ?? "anonymous"}`;
}

function loadDraft(walletAddress: string | null): DraftData | null {
  try {
    const raw = localStorage.getItem(getDraftKey(walletAddress));
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch {
    return null;
  }
}

function saveDraft(walletAddress: string | null, data: DraftData): void {
  try {
    localStorage.setItem(getDraftKey(walletAddress), JSON.stringify(data));
  } catch {
    // Storage quota exceeded — ignore silently.
  }
}

function clearDraft(walletAddress: string | null): void {
  try {
    localStorage.removeItem(getDraftKey(walletAddress));
  } catch {
    // Ignore.
  }
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function PostJobPage() {
  const { wallet, connectWallet } = useWallet();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const descriptionLabelId = useId();
  const [tokenAddress, setTokenAddress] = useState(
    process.env.NEXT_PUBLIC_NATIVE_TOKEN ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastAnnouncedSuccess, setLastAnnouncedSuccess] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [maxDescPayloadBytes, setMaxDescPayloadBytes] = useState(4096);
  const [fieldErrors, setFieldErrors] = useState<{
    amount?: string;
    description?: string;
    deadline?: string;
    tokenAddress?: string;
  }>({});
  const [rateLimit, setRateLimit] = useState<RateLimitStatus>({
    remaining: 5,
    cooldownEndsAt: null,
    isLimited: false,
  });

  // Draft saving state
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevWalletRef = useRef<string | null>(null);

  const parseAmountToStroops = (value: string): string | null => {
    const result = validateAmount(value);
    return result.stroops;
  };

  // Restore draft on mount and on wallet change
  useEffect(() => {
    const draft = loadDraft(wallet);
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount(draft.amount);
      setDescription(draft.description);
      setDeadline(draft.deadline);
      setTokenAddress(
        draft.tokenAddress || process.env.NEXT_PUBLIC_NATIVE_TOKEN || "",
      );
      setDraftSavedAt(draft.savedAt);
      setHasDraft(true);
    } else {
      setHasDraft(false);
      setDraftSavedAt(null);
    }
    prevWalletRef.current = wallet;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When wallet address changes, clear current form and load draft for new wallet
  useEffect(() => {
    if (prevWalletRef.current === wallet) return;
    prevWalletRef.current = wallet;
    setAmount("");
    setDescription("");
    setDeadline("");
    setTokenAddress(process.env.NEXT_PUBLIC_NATIVE_TOKEN ?? "");
    setDraftSavedAt(null);
    setHasDraft(false);
    const draft = loadDraft(wallet);
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount(draft.amount);
      setDescription(draft.description);
      setDeadline(draft.deadline);
      setTokenAddress(
        draft.tokenAddress || process.env.NEXT_PUBLIC_NATIVE_TOKEN || "",
      );
      setDraftSavedAt(draft.savedAt);
      setHasDraft(true);
    }
  }, [wallet]);

  useEffect(() => {
    if (!wallet) {
      setError(null);
      setSuccess(null);
      setTxHash(null);
    }
  }, [wallet]);

  useEffect(() => {
    void getDescPayloadMax()
      .then((maxBytes) => {
        if (maxBytes > 0) {
          setMaxDescPayloadBytes(maxBytes);
        }
      })
      .catch(() => {
        // Keep default when contract read is unavailable.
      });
  }, []);

  useEffect(() => {
    setRateLimit(getRateLimitStatus());
    const interval = setInterval(() => {
      setRateLimit(getRateLimitStatus());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Debounced auto-save draft on form value changes
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const isEmpty =
      !amount.trim() && !htmlToPlainText(description).trim() && !deadline;
    if (isEmpty) return;

    debounceTimerRef.current = setTimeout(() => {
      const now = Date.now();
      saveDraft(wallet, {
        amount,
        description,
        deadline,
        tokenAddress,
        savedAt: now,
      });
      setDraftSavedAt(now);
      setHasDraft(true);
    }, 800);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [amount, description, deadline, tokenAddress, wallet]);

  // Warn on navigation away when unsaved changes exist
  useEffect(() => {
    const hasContent =
      amount.trim() || htmlToPlainText(description).trim() || deadline;
    if (!hasContent) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [amount, description, deadline]);

  function handleClearDraft() {
    clearDraft(wallet);
    setAmount("");
    setDescription("");
    setDeadline("");
    setTokenAddress(process.env.NEXT_PUBLIC_NATIVE_TOKEN ?? "");
    setDraftSavedAt(null);
    setHasDraft(false);
    setFieldErrors({});
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Post Job</h1>

      {hasDraft && draftSavedAt && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>
            Draft saved{" "}
            {new Date(draftSavedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button
            type="button"
            onClick={handleClearDraft}
            className="ml-4 rounded px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Clear draft
          </button>
        </div>
      )}

      <form
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting) return;
          setError(null);
          setSuccess(null);
          setTxHash(null);
          setFieldErrors({});

          if (!wallet) {
            try {
              await connectWallet();
            } catch {
              setError("Failed to connect wallet. Is Freighter installed?");
            }
            return;
          }

          setSubmitting(true);
          try {
            const nextFieldErrors: {
              amount?: string;
              description?: string;
              deadline?: string;
              tokenAddress?: string;
            } = {};
            const amountResult = validateAmount(amount);
            const amountStroops = amountResult.stroops;
            if (amountResult.error) {
              nextFieldErrors.amount = amountResult.error;
            } else if (amountStroops) {
              const minError = validateAmountMin(amountStroops, MIN_JOB_AMOUNT_STROOPS, `${MIN_JOB_AMOUNT_XLM} XLM`);
              if (minError) nextFieldErrors.amount = minError;
            }

            const limitStatus = getRateLimitStatus();
            if (limitStatus.isLimited) {
              setError(
                `Rate limit reached. You can post at most 5 jobs per hour. Try again in ${formatCooldown(limitStatus.cooldownEndsAt!)}.`,
              );
              setRateLimit(limitStatus);
              return;
            }
            const plainDescription = htmlToPlainText(description);
            const descriptionBytes = new TextEncoder().encode(plainDescription).length;
            if (!plainDescription) {
              nextFieldErrors.description = "Job description cannot be empty.";
            } else if (descriptionBytes > maxDescPayloadBytes) {
              nextFieldErrors.description = `Description must be at most ${maxDescPayloadBytes} bytes (currently ${descriptionBytes}).`;
            }
            if (deadline) {
              const deadlineError = validateDeadline(deadline);
              if (deadlineError) nextFieldErrors.deadline = deadlineError;
            }
            if (!tokenAddress.trim()) {
              nextFieldErrors.tokenAddress = "Token address is required.";
            } else {
              const tokenError = validateTokenAddress(tokenAddress);
              if (tokenError) nextFieldErrors.tokenAddress = tokenError;
            }
            if (Object.keys(nextFieldErrors).length > 0) {
              setFieldErrors(nextFieldErrors);
              return;
            }
            const htmlContent = description.trim();
            const plainContent = htmlToPlainText(htmlContent);
            const hashHex = await sha256Hex(plainContent);
            const descriptionPayloadLen = new TextEncoder().encode(plainContent).length;
            const deadlineUnix = deadline
              ? Math.floor(new Date(deadline).getTime() / 1000).toString()
              : "0";

            localStorage.setItem(`job-desc:${hashHex}`, htmlContent);
            const cid = await uploadToIpfs(htmlContent);
            const result = await postJob(
              wallet,
              amountStroops!,
              hashHex,
              descriptionPayloadLen,
              deadlineUnix,
              tokenAddress.trim(),
            );
            if (cid && !cid.startsWith("fallback:")) {
              try {
                await storeDescriptionCid(wallet, hashHex, cid);
              } catch {
                // CID storage is best-effort.
              }
            }
            if (result.hash) {
              setTxHash(result.hash);
            }
            recordPostJob();
            setRateLimit(getRateLimitStatus());
            const jobId = typeof result === "number" || typeof result === "string" ? result : null;
            const successMessage =
              jobId != null ? `Job #${jobId} created successfully.` : "Job submitted to contract.";
            setSuccess(successMessage);
            if (successMessage !== lastAnnouncedSuccess) {
              setLastAnnouncedSuccess(successMessage);
            }

            // Clear form and draft after successful submission.
            clearDraft(wallet);
            setAmount("");
            setDescription("");
            setDeadline("");
            setDraftSavedAt(null);
            setHasDraft(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to post job. Please try again.");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {(fieldErrors.amount ||
          fieldErrors.description ||
          fieldErrors.deadline ||
          fieldErrors.tokenAddress) && (
          <div
            id="post-job-errors"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <p className="font-medium">Please correct the highlighted fields:</p>
            <ul className="mt-2 list-disc pl-5">
              {fieldErrors.amount && <li>{fieldErrors.amount}</li>}
              {fieldErrors.description && <li>{fieldErrors.description}</li>}
              {fieldErrors.deadline && <li>{fieldErrors.deadline}</li>}
              {fieldErrors.tokenAddress && <li>{fieldErrors.tokenAddress}</li>}
            </ul>
          </div>
        )}

        <label className="block text-sm font-medium">
          Amount (XLM)
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            type="number"
            min="0.0000001"
            step="0.0000001"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setFieldErrors((current) => ({ ...current, amount: undefined }));
            }}
            aria-invalid={Boolean(fieldErrors.amount)}
            aria-describedby={fieldErrors.amount ? "post-job-amount-error" : "post-job-amount-helper"}
            required
          />
          <p id="post-job-amount-helper" className="mt-1 text-xs text-slate-500">
            Enter amount in XLM with up to 7 decimal places (e.g., 10.5 or 0.0000001). Minimum: {MIN_JOB_AMOUNT_XLM} XLM.
          </p>
          {fieldErrors.amount && (
            <p id="post-job-amount-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.amount}
            </p>
          )}
        </label>

        <div className="block text-sm font-medium">
          <span id={descriptionLabelId}>Job Description</span>
          <div className="mt-1">
            <RichTextEditor
              value={description}
              onChange={(html) => {
                setDescription(html);
                setFieldErrors((current) => ({ ...current, description: undefined }));
              }}
              maxBytes={maxDescPayloadBytes}
              error={fieldErrors.description}
              errorId={fieldErrors.description ? "post-job-description-error" : undefined}
              labelId={descriptionLabelId}
              required
            />
          </div>
          {fieldErrors.description && (
            <p id="post-job-description-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.description}
            </p>
          )}
        </div>

        <label className="block text-sm font-medium">
          Deadline (optional)
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            type="date"
            value={deadline}
            onChange={(e) => {
              setDeadline(e.target.value);
              setFieldErrors((current) => ({ ...current, deadline: undefined }));
            }}
            aria-invalid={Boolean(fieldErrors.deadline)}
            aria-describedby={fieldErrors.deadline ? "post-job-deadline-error" : undefined}
          />
          {fieldErrors.deadline && (
            <p id="post-job-deadline-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.deadline}
            </p>
          )}
        </label>

        <label className="block text-sm font-medium">
          Token Address
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
            type="text"
            value={tokenAddress}
            onChange={(e) => {
              setTokenAddress(e.target.value);
              setFieldErrors((current) => ({ ...current, tokenAddress: undefined }));
            }}
            aria-invalid={Boolean(fieldErrors.tokenAddress)}
            aria-describedby={
              fieldErrors.tokenAddress ? "post-job-token-address-error" : undefined
            }
            required
          />
          {fieldErrors.tokenAddress && (
            <p id="post-job-token-address-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.tokenAddress}
            </p>
          )}
        </label>

        {rateLimit.cooldownEndsAt && (
          <div
            className="rounded-md bg-blue-50 p-3 text-sm text-blue-700"
            role="status"
            aria-live="polite"
          >
            {rateLimit.isLimited
              ? `Rate limit: You can post again in ${formatCooldown(rateLimit.cooldownEndsAt)}`
              : `${rateLimit.remaining} job post${rateLimit.remaining === 1 ? "" : "s"} remaining this hour`}
          </div>
        )}

        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting || rateLimit.isLimited}
          aria-busy={submitting}
        >
          {submitting ? "Posting..." : "Post Job"}
        </button>
        <p className="mt-2 text-xs text-slate-500">
          A 2.5% platform fee applies on job completion.{" "}
          <a
            href="https://github.com/anoncon/Stellar-work-/blob/main/docs/TOKENOMICS.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Learn more about fees
          </a>
        </p>
      </form>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {success && (
        <p role="status" aria-live="polite" aria-atomic="true" className="rounded-md bg-green-100 p-3 text-sm text-green-700">
          {success}
        </p>
      )}
      {txHash && (
        <p className="text-sm text-slate-700">
          Transaction:{" "}
          <a
            href={getExplorerTxUrl(txHash)}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
          >
            {txHash}
          </a>
        </p>
      )}
    </section>
  );
}
