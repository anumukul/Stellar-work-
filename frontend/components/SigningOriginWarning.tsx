"use client";

/**
 * SigningOriginWarning
 *
 * Renders a visible "confirmation boundary" whenever a wallet signing request
 * does not originate from a known StellarWork platform origin.
 *
 * Usage:
 *   - Drop this above the Confirm button inside any transaction flow.
 *   - It only renders when `decision` is "WARN" — callers need not guard.
 *   - For "REJECT" decisions the caller should throw/block before rendering;
 *     this component is not a substitute for the hard block in stellar.ts.
 *
 * Accessibility:
 *   - role="alert" + aria-live="assertive" so screen-reader users hear the
 *     warning immediately when it mounts.
 *   - The disclosure toggle for the origin detail uses a <button> so it is
 *     keyboard-focusable with a visible focus ring.
 */

import { useState } from "react";
import type { OriginValidationResult } from "@/lib/signing-origin-validator";

export interface SigningOriginWarningProps {
  originResult: OriginValidationResult;
  /**
   * When true the component renders nothing — the origin is trusted.
   * Provided as a convenience so callers can always mount this component
   * and let it decide whether to show itself.
   */
  suppress?: boolean;
}

export default function SigningOriginWarning({
  originResult,
  suppress = false,
}: SigningOriginWarningProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Only render for WARN — REJECT is handled higher up (throws before UI).
  if (suppress || originResult.decision !== "WARN") {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950"
    >
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        {/* Warning icon */}
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-50"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            External signing request
          </p>
          <p className="mt-1 leading-5 text-amber-800 dark:text-amber-200">
            This transaction is being requested from an origin that is not
            recognised as a StellarWork platform address. Only approve if you
            initiated this action yourself.
          </p>

          {/* ── Collapsible origin detail ─────────────────────────────── */}
          <button
            type="button"
            onClick={() => setDetailsOpen((prev) => !prev)}
            aria-expanded={detailsOpen}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-amber-300"
          >
            <svg
              aria-hidden="true"
              className={`h-3 w-3 shrink-0 transition-transform duration-150 ${detailsOpen ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
            </svg>
            {detailsOpen ? "Hide" : "Show"} origin details
          </button>

          {detailsOpen && (
            <dl className="mt-2 space-y-1 rounded-md bg-amber-100 px-3 py-2 text-xs dark:bg-amber-900">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="font-medium text-amber-900 dark:text-amber-100 sm:w-28 sm:shrink-0">
                  Request origin
                </dt>
                <dd className="break-all font-mono text-amber-800 dark:text-amber-200">
                  {originResult.origin}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="font-medium text-amber-900 dark:text-amber-100 sm:w-28 sm:shrink-0">
                  Status
                </dt>
                <dd className="text-amber-800 dark:text-amber-200">
                  Not in platform allowlist
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      {/* ── Phishing reminder ─────────────────────────────────────────── */}
      <p className="mt-3 border-t border-amber-200 pt-3 text-xs text-amber-700 dark:border-amber-700 dark:text-amber-300">
        <strong>Phishing warning:</strong> Legitimate StellarWork transactions
        will only ever request approval from{" "}
        <span className="font-mono">stellarwork.org</span> or its official
        subdomains. If you did not navigate here yourself, close this page
        immediately.
      </p>
    </div>
  );
}
