"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useModalFocusTrap } from "@/lib/modal";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/components/ToastProvider";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import NoResultsState from "@/components/NoResultsState";
import SectionCard from "@/components/SectionCard";
import Spinner from "@/components/Spinner";
import { toXlm } from "@/lib/format";
import { isConfirmSuppressed, CONFIRM_KEYS } from "@/lib/confirm-prefs";
import { raiseDispute as contractRaiseDispute, resolveDispute as contractResolveDispute } from "@/lib/contract";
import {
  loadDisputesPageData,
  type Dispute,
  type DisputeStatus,
  type EligibleJob,
} from "@/lib/disputes-loader";

type Role = "client" | "freelancer" | "admin";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<DisputeStatus, { label: string; color: string; dot: string }> = {
  Active: { label: "Active", color: "text-amber-600 bg-amber-50 ring-amber-200", dot: "bg-amber-500" },
  PendingEvidence: { label: "Evidence Needed", color: "text-blue-600 bg-blue-50 ring-blue-200", dot: "bg-blue-500" },
  UnderReview: { label: "Under Review", color: "text-violet-600 bg-violet-50 ring-violet-200", dot: "bg-violet-500" },
  Resolved: { label: "Resolved", color: "text-emerald-600 bg-emerald-50 ring-emerald-200", dot: "bg-emerald-500" },
  Closed: { label: "Closed", color: "text-slate-500 bg-slate-100 ring-slate-200", dot: "bg-slate-400" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtAmount(n: number): string {
  return `${toXlm(n)} XLM`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DisputeStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${m.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function DisputesLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Spinner size="lg" color="#334155" label="Loading disputes" />
    </div>
  );
}

// ─── Raise Dispute Modal ──────────────────────────────────────────────────────

function RaiseDisputeModal({
  jobs,
  onClose,
  onSubmit,
}: {
  jobs: EligibleJob[];
  onClose: () => void;
  onSubmit: (jobId: string, reason: string, evidence: string) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useModalFocusTrap(true, dialogRef, handleClose);

  async function handleSubmit() {
    if (loading) return;
    if (!reason.trim()) { setError("Please describe the dispute reason."); return; }
    setError("");
    setLoading(true);
    try {
      await onSubmit(jobId, reason, evidence);
      onClose();
    } catch {
      setError("Failed to raise dispute. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Raise a Dispute</h2>
            <p className="text-xs text-slate-500 mt-0.5">Funds will be held in escrow until resolved</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close raise dispute modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          {/* Body */}
          <div className="px-6 py-5 space-y-4">
          {/* Job selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Job</label>
            <select
              value={jobId}
              onChange={e => setJobId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.title} — {fmtAmount(j.amount)}</option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Reason <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Describe the issue clearly…"
              required
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 resize-none"
            />
          </div>

          {/* Evidence */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Supporting Evidence <span className="text-slate-400">(optional)</span></label>
            <textarea
              value={evidence}
              onChange={e => setEvidence(e.target.value)}
              rows={2}
              placeholder="Links, file references, timestamps…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 resize-none"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 ring-1 ring-red-200">{error}</p>
          )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {loading && <Spinner size={14} color="currentColor" label="Submitting dispute" />}
              Submit Dispute
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Admin Resolve Modal ──────────────────────────────────────────────────────

function ResolveModal({
  dispute,
  onClose,
  onResolve,
}: {
  dispute: Dispute;
  onClose: () => void;
  onResolve: (id: string, clientShare: number, note: string) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [clientShare, setClientShare] = useState(50);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const freelancerShare = 100 - clientShare;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useModalFocusTrap(true, dialogRef, handleClose);

  async function handleResolve() {
    if (loading) return;
    if (!note.trim()) { setError("Resolution note is required."); return; }
    setError("");
    setLoading(true);
    try {
      await onResolve(dispute.id, clientShare, note);
      onClose();
    } catch {
      setError("Failed to resolve dispute. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Resolve Dispute</h2>
            <p className="text-xs text-slate-500 mt-0.5">{dispute.jobTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close resolve dispute modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleResolve();
          }}
        >
          <div className="px-6 py-5 space-y-5">
          {/* Fund split */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-700">Fund Split</label>
              <span className="text-xs text-slate-500">Total: {fmtAmount(dispute.amount)}</span>
            </div>

            {/* Split bar */}
            <div className="relative h-8 rounded-lg overflow-hidden bg-slate-100 mb-3">
              <div
                className="absolute left-0 top-0 h-full bg-blue-500 transition-all duration-150 flex items-center justify-center"
                style={{ width: `${clientShare}%` }}
              >
                {clientShare > 15 && (
                  <span className="text-[10px] font-semibold text-white">{clientShare}%</span>
                )}
              </div>
              <div
                className="absolute right-0 top-0 h-full bg-violet-500 transition-all duration-150 flex items-center justify-center"
                style={{ width: `${freelancerShare}%` }}
              >
                {freelancerShare > 15 && (
                  <span className="text-[10px] font-semibold text-white">{freelancerShare}%</span>
                )}
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              value={clientShare}
              onChange={e => setClientShare(Number(e.target.value))}
              className="w-full accent-slate-800"
            />

            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-blue-50 px-3 py-2 ring-1 ring-blue-100">
                <p className="text-[10px] text-blue-500 font-medium uppercase tracking-wide">Client</p>
                <p className="text-sm font-semibold text-blue-700 mt-0.5">{fmtAmount(Math.floor(dispute.amount * clientShare / 100))}</p>
                <p className="text-[10px] text-blue-400">{dispute.client}</p>
              </div>
              <div className="rounded-lg bg-violet-50 px-3 py-2 ring-1 ring-violet-100">
                <p className="text-[10px] text-violet-500 font-medium uppercase tracking-wide">Freelancer</p>
                <p className="text-sm font-semibold text-violet-700 mt-0.5">{fmtAmount(Math.floor(dispute.amount * freelancerShare / 100))}</p>
                <p className="text-[10px] text-violet-400">{dispute.freelancer}</p>
              </div>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Resolution Note <span className="text-red-500">*</span></label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="Explain the basis for this resolution…"
              required
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 resize-none"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 ring-1 ring-red-200">{error}</p>
          )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {loading && <Spinner size={14} color="currentColor" label="Resolving dispute" />}
              Confirm Resolution
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Dispute Card ─────────────────────────────────────────────────────────────

function DisputeCard({
  dispute,
  role,
  onResolveClick,
}: {
  dispute: Dispute;
  role: Role;
  onResolveClick?: (d: Dispute) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canResolve = role === "admin" && (dispute.status === "Active" || dispute.status === "UnderReview" || dispute.status === "PendingEvidence");

  return (
    <div className="interactive-card overflow-hidden">
      {/* Card header */}
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs font-mono text-slate-400">{dispute.id}</span>
            <StatusBadge status={dispute.status} />
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">Raised by {dispute.raisedBy}</span>
          </div>
          <h2 className="text-sm font-semibold text-slate-900 truncate">{dispute.jobTitle}</h2>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-slate-500">{dispute.client} <span className="text-slate-300">vs</span> {dispute.freelancer}</span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className="text-base font-bold text-slate-900">{fmtAmount(dispute.amount)}</p>
          <p className="text-xs text-slate-400">{fmtDate(dispute.raisedAt)}</p>
        </div>
      </div>

      {/* Reason preview */}
      <div className="px-5 pb-3">
        <p className="text-xs text-slate-600 line-clamp-2">{dispute.reason}</p>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 space-y-3">
          {dispute.evidence && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Evidence</p>
              <p className="text-xs text-slate-600">{dispute.evidence}</p>
            </div>
          )}

          {dispute.resolution && (
            <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-100 p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Resolution — {fmtDate(dispute.resolution.resolvedAt)}</p>
              <div className="flex gap-3">
                <div>
                  <p className="text-[10px] text-emerald-500">Client received</p>
                  <p className="text-sm font-bold text-emerald-700">{fmtAmount(Math.floor(dispute.amount * dispute.resolution.clientShare / 100))}</p>
                  <p className="text-[10px] text-emerald-400">{dispute.resolution.clientShare}%</p>
                </div>
                <div className="w-px bg-emerald-200" />
                <div>
                  <p className="text-[10px] text-emerald-500">Freelancer received</p>
                  <p className="text-sm font-bold text-emerald-700">{fmtAmount(Math.floor(dispute.amount * dispute.resolution.freelancerShare / 100))}</p>
                  <p className="text-[10px] text-emerald-400">{dispute.resolution.freelancerShare}%</p>
                </div>
              </div>
              <p className="text-xs text-emerald-700 border-t border-emerald-100 pt-2">{dispute.resolution.note}</p>
            </div>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          {expanded ? "Collapse ↑" : "View details ↓"}
        </button>

        {canResolve && onResolveClick && (
          <button
            onClick={() => onResolveClick(dispute)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 transition-colors"
          >
            Resolve
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DisputesPage() {
  const { wallet, connectWallet } = useWallet();
  const [role, setRole] = useState<Role>("client");
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [eligibleJobs, setEligibleJobs] = useState<EligibleJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");

  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<Dispute | null>(null);
  const [showRaiseConfirm, setShowRaiseConfirm] = useState(false);
  const [pendingDisputeJobId, setPendingDisputeJobId] = useState<string | null>(null);
  const { showSuccess, showError } = useToast();

  // Sync role with wallet/admin status
  useEffect(() => {
    if (!wallet) {
      setDisputes([]);
      setEligibleJobs([]);
      setRole("client"); // Default role
      return;
    }

    const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
    if (adminAddress && wallet === adminAddress) {
      setRole("admin");
    }
  }, [wallet]);

  const loadDisputes = useCallback(async () => {
    if (!wallet) {
      setDisputes([]);
      setEligibleJobs([]);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await loadDisputesPageData(wallet);
      setDisputes(data.disputes);
      setEligibleJobs(data.eligibleJobs);
    } catch {
      setError("Failed to load disputes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void loadDisputes();
  }, [loadDisputes, role]);

  const filteredDisputes = disputes.filter(d => {
    if (filter === "active") return ["Active", "UnderReview", "PendingEvidence"].includes(d.status);
    if (filter === "resolved") return ["Resolved", "Closed"].includes(d.status);
    return true;
  });

  async function handleRaiseDispute(jobId: string, reason: string, evidence: string) {
    if (!wallet) return;
    try {
      await contractRaiseDispute(wallet, jobId);
      const job = eligibleJobs.find(j => j.id === jobId)!;
      const newDispute: Dispute = {
        id: `D-${String(disputes.length + 1).padStart(3, "0")}`,
        jobId,
        jobTitle: job.title,
        client: role === "client" ? "You" : job.counterparty,
        freelancer: role === "freelancer" ? "You" : job.counterparty,
        amount: job.amount,
        raisedBy: role as "client" | "freelancer",
        raisedAt: new Date().toISOString(),
        status: "Active",
        reason,
        evidence,
      };
      setDisputes(prev => [newDispute, ...prev]);
      showSuccess("Dispute raised. Funds held in escrow.");
    } catch {
      showError("Failed to raise dispute. Please try again.");
    }
  }

  async function handleResolve(id: string, clientShare: number, note: string) {
    try {
      const jobId = disputes.find(d => d.id === id)?.jobId;
      if (!jobId) return;
      await contractResolveDispute(jobId, clientShare);
      setDisputes(prev =>
        prev.map(d =>
          d.id === id
            ? {
                ...d,
                status: "Resolved" as DisputeStatus,
                resolution: {
                  resolvedAt: new Date().toISOString(),
                  clientShare,
                  freelancerShare: 100 - clientShare,
                  note,
                },
              }
            : d
        )
      );
      showSuccess("Dispute resolved and funds disbursed.");
    } catch {
      showError("Failed to resolve dispute. Please try again.");
    }
  }

  const activeCount = disputes.filter(d => ["Active", "UnderReview", "PendingEvidence"].includes(d.status)).length;

  if (!wallet) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-6">Disputes</h1>
          <SectionCard className="p-8 text-center">
            <p className="text-slate-600">Connect your wallet to view and manage disputes.</p>
            <button
              className="mt-4 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
              onClick={async () => {
                try { await connectWallet(); } catch { /* cancelled */ }
              }}
            >
              Connect Wallet
            </button>
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Page header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Disputes</h1>
            <p className="mt-1 text-sm text-slate-500">
              {activeCount > 0 ? `${activeCount} active dispute${activeCount > 1 ? "s" : ""}` : "All disputes resolved"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Role switcher (dev/demo only) */}
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
              {(["client", "freelancer", "admin"] as Role[]).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors ${
                    role === r ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {role !== "admin" && (
              <button
                onClick={() => {
                  if (isConfirmSuppressed(CONFIRM_KEYS.raiseDispute)) {
                    setShowRaiseModal(true);
                  } else {
                    setShowRaiseConfirm(true);
                  }
                }}
                disabled={eligibleJobs.length === 0}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                aria-haspopup="dialog"
              >
                + Raise Dispute
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mb-5 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
          {(["all", "active", "resolved"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                filter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Admin notice */}
        {role === "admin" && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="text-base">🛡️</span>
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Admin mode.</span> You can resolve disputes and adjust fund splits. All resolutions are final and trigger on-chain transfers (SC-2).
            </p>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <DisputesLoading />
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}{" "}
            <button type="button" className="underline" onClick={() => void loadDisputes()}>
              Retry
            </button>
          </div>
        ) : filteredDisputes.length === 0 ? (
          filter !== "all" && disputes.length > 0 ? (
            <NoResultsState
              title="No disputes match this filter"
              description="Try a different tab or clear the filter to see every dispute."
              actionLabel="Show all disputes"
              onAction={() => setFilter("all")}
              className="border-slate-200 bg-slate-50"
            />
          ) : (
            <EmptyState
              title="No disputes found"
              description={
                filter === "active"
                  ? "No active disputes yet."
                  : filter === "resolved"
                    ? "No resolved disputes yet."
                    : "No disputes yet."
              }
              className="border-slate-200 bg-slate-50"
            />
          )
        ) : (
          <div className="space-y-3">
            {filteredDisputes.map(d => (
              <DisputeCard
                key={d.id}
                dispute={d}
                role={role}
                onResolveClick={d => setResolveTarget(d)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showRaiseConfirm && (
        <ConfirmDialog
          open={true}
          title="Raise a dispute?"
          description="Raising a dispute will freeze the escrowed funds until an admin resolves the case. Both parties will be notified."
          consequences={[
            "Funds remain locked in escrow — neither party can withdraw.",
            "The job moves to Disputed status.",
            "An admin must resolve the dispute before funds are released.",
          ]}
          confirmLabel="Yes, raise dispute"
          variant="warning"
          suppressKey={CONFIRM_KEYS.raiseDispute}
          onConfirm={() => {
            setShowRaiseConfirm(false);
            setShowRaiseModal(true);
          }}
          onCancel={() => setShowRaiseConfirm(false)}
        />
      )}
      {showRaiseModal && (
        <RaiseDisputeModal
          jobs={eligibleJobs}
          onClose={() => setShowRaiseModal(false)}
          onSubmit={handleRaiseDispute}
        />
      )}
      {resolveTarget && (
        <ResolveModal
          dispute={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onResolve={handleResolve}
        />
      )}
    </div>
  );
}
