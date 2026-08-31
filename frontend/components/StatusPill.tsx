"use client";

import type { JobStatus } from "@/lib/types";
import { CircleDot, PlayCircle, Eye, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const STATUS_META: Record<JobStatus, { label: string; className: string; Icon: any }> = {
  Open: {
    label: "Open",
    className: "bg-blue-100 text-blue-800 ring-blue-200",
    Icon: CircleDot,
  },
  InProgress: {
    label: "In Progress",
    className: "bg-yellow-100 text-yellow-800 ring-yellow-200",
    Icon: PlayCircle,
  },
  SubmittedForReview: {
    label: "Submitted for Review",
    className: "bg-purple-100 text-purple-800 ring-purple-200",
    Icon: Eye,
  },
  Completed: {
    label: "Completed",
    className: "bg-green-100 text-green-800 ring-green-200",
    Icon: CheckCircle2,
  },
  Cancelled: {
    label: "Cancelled",
    className: "bg-red-100 text-red-800 ring-red-200",
    Icon: XCircle,
  },
  Disputed: {
    label: "Disputed",
    className: "bg-orange-100 text-orange-800 ring-orange-200",
    Icon: AlertCircle,
  },
};

export function getJobStatusLabel(status: JobStatus) {
  return STATUS_META[status].label;
}

export default function StatusPill({
  status,
  className = "",
  isLoading = false,
}: {
  status: JobStatus;
  className?: string;
  isLoading?: boolean;
}) {
  const [prevStatus, setPrevStatus] = useState(status);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (status !== prevStatus) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setPrevStatus(status);
        setIsTransitioning(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [status, prevStatus]);

  const displayStatus = isTransitioning ? prevStatus : status;
  const meta = STATUS_META[displayStatus];
  const Icon = isLoading ? Loader2 : meta.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-all duration-300 ease-in-out motion-reduce:transition-none ${
        isLoading
          ? "bg-slate-100 text-slate-700 ring-slate-200 opacity-90"
          : meta.className
      } ${className}`.trim()}
    >
      <Icon
        className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""} transition-transform duration-300`}
        aria-hidden="true"
      />
      <span className="relative inline-flex overflow-hidden">
        <span
          className={`transition-all duration-400 ease-in-out motion-reduce:transition-none ${
            isTransitioning
              ? "opacity-0 -translate-y-2 blur-sm"
              : "opacity-100 translate-y-0 blur-none"
          }`}
        >
          {isLoading ? "Processing..." : meta.label}
        </span>
      </span>
    </span>
  );
}
