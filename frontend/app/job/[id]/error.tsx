"use client";

import RouteErrorState from "@/components/RouteErrorState";

export default function JobError({
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  /** Next 16.3 (stable): re-fetches the segment. See app/error.tsx. */
  retry?: () => void;
  /** Pre-16.3 name, kept as a fallback. */
  reset?: () => void;
}) {
  return (
    <RouteErrorState
      title="Job details unavailable"
      description="The job page could not be loaded. Retry or return to the job list."
      backHref="/"
      backLabel="Jobs"
      onRetry={retry ?? reset ?? (() => undefined)}
    />
  );
}
