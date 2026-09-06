"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  /**
   * Next 16.3 (stable): re-fetches and re-renders the boundary's children.
   * This is what a user pressing "Try again" expects — most errors here come
   * from a failed data fetch, and re-rendering without re-fetching reproduces
   * the same failure, so the button appears to do nothing.
   */
  retry?: () => void;
  /**
   * Pre-16.3 name, kept so the component still recovers on an older runtime.
   * `reset` clears the error state without re-fetching.
   */
  reset?: () => void;
}) {
  // Prefer retry; fall back to reset so neither runtime leaves a dead button.
  const recover = retry ?? reset ?? (() => undefined);
  const uid = useId();
  const [errorId] = useState(() => {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ERR-${ts}-${rand}`;
  });

  useEffect(() => {
     
    console.error("[StellarWork]", errorId, error);
  }, [error, errorId]);

  return (
    <section
      className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center"
      aria-labelledby={`${uid}-heading`}
    >
      <div
        aria-hidden="true"
        className="flex h-24 w-24 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-900/20"
      >
        <span className="text-5xl select-none">⚠️</span>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-rose-500">
          Error
        </p>
        <h1
          id={`${uid}-heading`}
          className="text-3xl font-bold text-slate-900 dark:text-slate-100"
        >
          Something went wrong
        </h1>
        <p className="max-w-md text-base text-slate-500 dark:text-slate-400">
          An unexpected error occurred. You can try again or return home. If the
          problem persists, contact support with the reference code below.
        </p>
        <p className="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500">
          Ref: {errorId}
          {error.digest ? ` · digest: ${error.digest}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={recover}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Go home
        </Link>
      </div>
    </section>
  );
}
