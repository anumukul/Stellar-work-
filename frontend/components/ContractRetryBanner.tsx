"use client";

import { useContractRetryStatus } from "@/lib/useContractRetryStatus";

type ContractRetryBannerProps = {
  onManualRetry?: () => void;
  onRetryQueue?: () => void;
};

export default function ContractRetryBanner({
  onManualRetry,
  onRetryQueue,
}: ContractRetryBannerProps) {
  const status = useContractRetryStatus();

  const showBackoff = status.isRetrying && status.phase === "backoff";
  const showCircuit = status.circuitOpen;
  const showExhausted = status.phase === "exhausted";
  const showQueue = status.queuedWriteCount > 0 && !showBackoff;

  if (!showBackoff && !showCircuit && !showExhausted && !showQueue) {
    return null;
  }

  const countdownSec = Math.ceil(status.countdownMs / 1000);
  const circuitSec = Math.ceil(status.circuitCooldownMs / 1000);

  return (
    <div className="space-y-2">
      {showBackoff && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <span>
            Network issue — retrying{" "}
            <span className="font-semibold">{status.operation}</span> (attempt{" "}
            {status.attempt}/{status.maxRetries}) in{" "}
            <span className="font-semibold tabular-nums">{countdownSec}s</span>
          </span>
        </div>
      )}

      {showCircuit && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-orange-100 p-3 text-sm text-orange-900 dark:bg-orange-950/50 dark:text-orange-100"
        >
          <span>
            RPC circuit breaker open — pausing contract calls for{" "}
            <span className="font-semibold tabular-nums">{circuitSec}s</span> after
            repeated failures.
          </span>
        </div>
      )}

      {showExhausted && onManualRetry && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-100"
        >
          <span>
            <span className="font-semibold">{status.operation}</span> failed after{" "}
            {status.maxRetries} attempts.
          </span>
          <button
            type="button"
            onClick={onManualRetry}
            className="rounded px-2 py-1 font-semibold text-red-900 hover:bg-red-200 dark:hover:bg-red-900/50"
          >
            Retry now
          </button>
        </div>
      )}

      {showQueue && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-100 p-3 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200"
        >
          <span>
            {status.queuedWriteCount} failed write
            {status.queuedWriteCount === 1 ? "" : "s"} queued for retry.
          </span>
          {onRetryQueue && (
            <button
              type="button"
              onClick={onRetryQueue}
              className="rounded px-2 py-1 font-semibold text-slate-900 hover:bg-slate-200 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Retry queued
            </button>
          )}
        </div>
      )}
    </div>
  );
}
