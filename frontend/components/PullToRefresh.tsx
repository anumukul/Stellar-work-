"use client";

import { PULL_THRESHOLD, usePullToRefresh } from "@/lib/use-pull-to-refresh";

type Props = {
  /** Reload the page's data. Awaited so the spinner matches the real request. */
  onRefresh: () => void | Promise<void>;
  /** Turn off gesture tracking (e.g. nothing to refresh yet). */
  disabled?: boolean;
  /** Label for the keyboard-accessible fallback button. */
  label?: string;
};

const PHASE_TEXT = {
  idle: "",
  pulling: "Pull to refresh",
  ready: "Release to refresh",
  refreshing: "Refreshing…",
  done: "Updated",
} as const;

/**
 * Mobile pull-to-refresh affordance. Drop it inside a page's root element and
 * point `onRefresh` at that page's data loader.
 */
export default function PullToRefresh({ onRefresh, disabled = false, label = "Refresh content" }: Props) {
  const { phase, distance, progress, refresh } = usePullToRefresh(onRefresh, { disabled });

  const visible = phase !== "idle";
  const offset = phase === "refreshing" || phase === "done" ? PULL_THRESHOLD : distance;

  return (
    <>
      {/* Keyboard/screen-reader path to the same refresh. */}
      <button
        type="button"
        onClick={refresh}
        disabled={disabled || phase === "refreshing"}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-md focus:outline-none dark:focus:bg-slate-800 dark:focus:text-slate-100"
      >
        {label}
      </button>

      <div role="status" aria-live="polite" className="sr-only">
        {phase === "refreshing" || phase === "done" ? PHASE_TEXT[phase] : ""}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-0 z-40 flex -translate-x-1/2 justify-center"
        style={{
          transform: `translate3d(-50%, ${offset}px, 0)`,
          opacity: visible ? Math.max(progress, 0.4) : 0,
          transition: distance === 0 ? "transform 200ms ease-out, opacity 200ms ease-out" : "opacity 120ms linear",
        }}
      >
        <div className="mt-2 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {phase === "refreshing" ? (
            <svg className="h-4 w-4 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          ) : phase === "done" ? (
            <svg
              className="h-4 w-4 text-emerald-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg
              className="h-4 w-4 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              style={{
                transform: `rotate(${phase === "ready" ? 180 : 0}deg)`,
                transition: "transform 150ms ease-out",
              }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-5-5m5 5l5-5" />
            </svg>
          )}
          <span>{PHASE_TEXT[phase] || PHASE_TEXT.pulling}</span>
        </div>
      </div>
    </>
  );
}
