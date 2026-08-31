"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { toXlm } from "@/lib/format";
import type { Job, JobStatus } from "@/lib/types";

type ExportFormat = "csv" | "json";

const STATUS_MAP: Record<JobStatus, string> = {
  Open: "Posted",
  InProgress: "In Progress",
  SubmittedForReview: "Submitted",
  Completed: "Completed",
  Cancelled: "Cancelled",
  Disputed: "Disputed",
};

interface ExportJob {
  id: number;
  type: string;
  status: JobStatus;
  amount: string;
  created: string;
  deadline: string;
  counterparty: string;
}

function formatDate(deadline: string): string {
  if (deadline === "0") return "";
  return new Date(Number(deadline) * 1000).toISOString().slice(0, 10);
}

function buildExportData(
  jobs: Array<{ id: number; job: Job }>,
  wallet: string,
  dateFrom: string,
  dateTo: string,
): ExportJob[] {
  return jobs
    .map(({ id, job }) => {
      const isClient = job.client === wallet;
      const type = isClient ? "Posted" : "Accepted";
      const counterparty = isClient
        ? (job.freelancer || "")
        : job.client;
      const created = formatDate(String(job.created_at));
      return {
        id,
        type,
        status: job.status,
        amount: toXlm(job.amount),
        created,
        deadline: formatDate(job.deadline),
        counterparty,
      };
    })
    .filter((j) => {
      if (!dateFrom && !dateTo) return true;
      if (dateFrom && j.created < dateFrom) return false;
      if (dateTo && j.created > dateTo) return false;
      return true;
    });
}

function toCSV(data: ExportJob[]): string {
  const header = "ID,Type,Status,Amount (XLM),Created,Deadline,Counterparty";
  const rows = data.map((j) =>
    [
      j.id,
      j.type,
      STATUS_MAP[j.status] || j.status,
      j.amount,
      j.created,
      j.deadline,
      j.counterparty,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ExportButton({
  jobs,
  wallet,
}: {
  jobs: Array<{ id: number; job: Job }>;
  wallet: string;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  const handleExport = () => {
    setLoading(true);
    try {
      const data = buildExportData(jobs, wallet, dateFrom, dateTo);
      const timestamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        triggerDownload(toCSV(data), `stellarwork-export-${timestamp}.csv`, "text/csv");
      } else {
        triggerDownload(
          JSON.stringify(data, null, 2),
          `stellarwork-export-${timestamp}.json`,
          "application/json",
        );
      }
    } finally {
      setLoading(false);
      close();
    }
  };

  if (jobs.length === 0) return null;

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Export
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
          role="dialog"
          aria-label="Export options"
        >
          <p className="mb-3 text-sm font-semibold">Export Job History</p>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Format
            </label>
            <div className="flex gap-2">
              {(["csv", "json"] as ExportFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    format === f
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Generating..." : `Download ${format.toUpperCase()}`}
          </button>
        </div>
      )}
    </div>
  );
}
