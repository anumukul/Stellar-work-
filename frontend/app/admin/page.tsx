"use client";

import {
  getFees,
  getNativeToken,
  withdrawFees,
  adminGetAllJobs,
  adminGetJobCount,
  getJobStatusCounts,
  setWhitelistMode,
  addToBlacklist,
  removeFromBlacklist,
  addToWhitelist,
  removeFromWhitelist,
  isWhitelistModeEnabled,
} from "@/lib/contract";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import ErrorBanner from "@/components/ErrorBanner";
import StatusPill from "@/components/StatusPill";
import SectionCard from "@/components/SectionCard";
import TruncatedAddress from "@/components/TruncatedAddress";
import { formatDeadline, toXlm } from "@/lib/format";
import { isConfirmSuppressed, CONFIRM_KEYS } from "@/lib/confirm-prefs";
import { useWallet } from "@/lib/wallet-context";
import type { Job, JobStatus, JobStatusCounts } from "@/lib/types";
import { STATUS_TO_COUNTS_KEY } from "@/lib/types";
import { useEffect, useState, useCallback } from "react";
import { ANNOUNCEMENT_STORAGE_KEY, type AnnouncementConfig } from "@/components/AnnouncementBanner";
import {
  getAllFlagNames,
  getFlagDescription,
  initFeatureFlags,
  setFlagOverride,
  clearAllOverrides,
  isEnabled,
} from "@/lib/feature-flags";

const TX_LOG_KEY = "stellarwork:admin-withdrawals";

interface WithdrawalTx {
  id: string;
  amount: string;
  timestamp: number;
  status: "completed";
}

const STATUS_LABELS: Record<JobStatus, string> = {
  Open: "Open",
  InProgress: "In Progress",
  SubmittedForReview: "Submitted for Review",
  Completed: "Completed",
  Cancelled: "Cancelled",
  Disputed: "Disputed",
};

export default function AdminPage() {
  const { wallet, connectWallet } = useWallet();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [fees, setFees] = useState<bigint>(0n);
  const [nativeToken, setNativeToken] = useState<string>("");
  const [jobs, setJobs] = useState<Array<{ id: number; job: Job }>>([]);
  const [statusCounts, setStatusCounts] = useState<JobStatusCounts>({
    open: 0,
    in_progress: 0,
    submitted_for_review: 0,
    completed: 0,
    cancelled: 0,
    disputed: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalTx[]>([]);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  // Announcement state
  const [announcementMsg, setAnnouncementMsg] = useState("");
  const [announcementType, setAnnouncementType] = useState<"info" | "warning" | "error" | "success">("info");
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [announcementTtl, setAnnouncementTtl] = useState<number>(0);

  // Access Control state
  const [accessTarget, setAccessTarget] = useState("");
  const [isWhitelistMode, setIsWhitelistMode] = useState(false);
  const [accessUpdating, setAccessUpdating] = useState(false);

  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const flagNames = getAllFlagNames();

  useEffect(() => {
    initFeatureFlags();
    const current: Record<string, boolean> = {};
    for (const name of flagNames) {
      current[name] = isEnabled(name);
    }
    setFeatureFlags(current);
  }, [flagNames]);

  const fetchAdminData = useCallback(async (walletAddress: string) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const token = await getNativeToken();
      setNativeToken(token);

      const accrued = await getFees(token);
      setFees(BigInt(accrued));

      const envAdmin = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
      if (!envAdmin || walletAddress !== envAdmin) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setIsAdmin(true);
      const actualAdmin = envAdmin;

      const count = await adminGetJobCount(actualAdmin);
      setJobs([]);
      setLoading(true);
      try {
        const limit = 50;
        const list = await adminGetAllJobs(actualAdmin, 0, Math.max(1, count > limit ? limit : count));
        const fetched = list.map((job, idx) => ({ id: idx + 1, job }));
        setJobs(fetched);
      } catch {
        setJobs([]);
      }

      // Fetch status counts in a single contract call instead of
      // iterating all jobs client-side.
      try {
        const counts = await getJobStatusCounts();
        setStatusCounts(counts);
      } catch {
        // Fallback to client-side computation if contract call fails
        const fallback = fetched.reduce<Record<string, number>>((acc, { job }) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        }, {});
        setStatusCounts({
          open: fallback["Open"] || 0,
          in_progress: fallback["InProgress"] || 0,
          submitted_for_review: fallback["SubmittedForReview"] || 0,
          completed: fallback["Completed"] || 0,
          cancelled: fallback["Cancelled"] || 0,
          disputed: fallback["Disputed"] || 0,
          total: fetched.length,
        });
      }

      const whitelistMode = await isWhitelistModeEnabled();
      setIsWhitelistMode(whitelistMode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data.");
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(TX_LOG_KEY);
        if (raw) setWithdrawals(JSON.parse(raw) as WithdrawalTx[]);
        
        const rawAnn = localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY);
        if (rawAnn) {
          const parsed = JSON.parse(rawAnn) as AnnouncementConfig;
          setAnnouncementMsg(parsed.message);
          setAnnouncementType(parsed.type);
          setAnnouncementEnabled(parsed.enabled);
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(TX_LOG_KEY, JSON.stringify(withdrawals));
      } catch {
        /* ignore */
      }
    }
  }, [withdrawals]);

  useEffect(() => {
    if (wallet) {
      fetchAdminData(wallet);
    } else {
      setLoading(false);
      setIsAdmin(null);
      setFees(0n);
      setJobs([]);
      setStatusCounts({ open: 0, in_progress: 0, submitted_for_review: 0, completed: 0, cancelled: 0, disputed: 0, total: 0 });
      setError(null);
      setSuccessMessage(null);
    }
  }, [wallet, fetchAdminData]);

  const handleWithdraw = async () => {
    if (!nativeToken) return;
    setShowWithdrawConfirm(false);
    setWithdrawing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await withdrawFees(nativeToken);
      const amount = toXlm(fees);
      setSuccessMessage(`Successfully withdrew ${amount} XLM in fees.`);
      const tx: WithdrawalTx = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        amount,
        timestamp: Date.now(),
        status: "completed",
      };
      setWithdrawals((prev) => [tx, ...prev].slice(0, 50));
      setFees(0n);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Withdraw failed.";
      if (msg.includes("Unauthorized") || msg.includes("#2")) {
        setIsAdmin(false);
        setError("Unauthorized: your wallet is not the contract admin.");
      } else {
        setError(msg);
      }
    } finally {
      setWithdrawing(false);
    }
  };

  const handlePublishAnnouncement = () => {
    const config: AnnouncementConfig = {
      id: `${Date.now()}`,
      type: announcementType,
      message: announcementMsg,
      enabled: announcementEnabled,
      expiresAt: announcementTtl > 0 ? Date.now() + announcementTtl * 60 * 60 * 1000 : null,
    };
    try {
      localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, JSON.stringify(config));
      window.dispatchEvent(new Event("stellarwork:announcement-updated"));
      setSuccessMessage("Announcement updated successfully.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e) {
      setError("Failed to publish announcement.");
    }
  };

  const handleAccessAction = async (action: "addBlacklist" | "removeBlacklist" | "addWhitelist" | "removeWhitelist") => {
    if (!wallet || !accessTarget) return;
    setAccessUpdating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const actualAdmin = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
      if (!actualAdmin || actualAdmin !== wallet) throw new Error("Unauthorized");
      if (action === "addBlacklist") await addToBlacklist(actualAdmin, accessTarget);
      else if (action === "removeBlacklist") await removeFromBlacklist(actualAdmin, accessTarget);
      else if (action === "addWhitelist") await addToWhitelist(actualAdmin, accessTarget);
      else if (action === "removeWhitelist") await removeFromWhitelist(actualAdmin, accessTarget);
      setSuccessMessage(`Successfully processed ${action} for ${accessTarget}`);
      setAccessTarget("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Access control action failed.");
    } finally {
      setAccessUpdating(false);
    }
  };

  const handleToggleWhitelistMode = async () => {
    if (!wallet) return;
    setAccessUpdating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const actualAdmin = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
      if (!actualAdmin || actualAdmin !== wallet) throw new Error("Unauthorized");
      await setWhitelistMode(actualAdmin, !isWhitelistMode);
      setIsWhitelistMode(!isWhitelistMode);
      setSuccessMessage(`Whitelist mode ${!isWhitelistMode ? "enabled" : "disabled"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle whitelist mode.");
    } finally {
      setAccessUpdating(false);
    }
  };

  if (!wallet) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <SectionCard className="p-8 text-center">
          <p className="text-slate-600">Connect your wallet to access admin controls.</p>
          <button
            className="mt-4 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
            onClick={async () => {
              try { await connectWallet(); } catch { /* cancelled */ }
            }}
          >
            Connect Wallet
          </button>
        </SectionCard>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <p className="text-sm text-slate-600">Loading admin data...</p>
      </section>
    );
  }

  if (isAdmin === false) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-800">Unauthorized</p>
          <p className="mt-1 text-sm text-red-600">
            Your wallet (<TruncatedAddress address={wallet} />) is not the
            contract admin.
          </p>
        </div>
      </section>
    );
  }

  const statusTotal = statusCounts.total || jobs.length;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin Panel</h1>

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onRetry={() => void fetchAdminData(wallet)}
        />
      )}
      {successMessage && (
        <p className="rounded-md bg-green-100 p-3 text-sm text-green-700">
          {successMessage}
        </p>
      )}

      <SectionCard title="Platform Fees">
        <p className="mt-2 flex min-w-0 items-baseline gap-2 text-3xl font-bold">
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap tabular-nums">
            {toXlm(fees)}
          </span>
          <span className="shrink-0 text-base font-semibold">XLM</span>
        </p>
        <p className="text-sm text-slate-500">Accrued platform fees (2.5%)</p>
        <button
          disabled={withdrawing || fees <= 0n}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            if (isConfirmSuppressed(CONFIRM_KEYS.withdrawFees)) {
              void handleWithdraw();
            } else {
              setShowWithdrawConfirm(true);
            }
          }}
          aria-haspopup="dialog"
        >
          {withdrawing ? "Withdrawing..." : "Withdraw Fees"}
        </button>
      </SectionCard>

      <SectionCard title="Announcement Management">
        <div className="space-y-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Message (HTML supported)</label>
            <textarea
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              rows={3}
              value={announcementMsg}
              onChange={(e) => setAnnouncementMsg(e.target.value)}
              placeholder="E.g. Scheduled maintenance on Friday at 2AM UTC."
            />
          </div>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Type</label>
              <select
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                value={announcementType}
                onChange={(e) => setAnnouncementType(e.target.value as any)}
              >
                <option value="info">Info (Blue)</option>
                <option value="warning">Warning (Yellow)</option>
                <option value="error">Error (Red)</option>
                <option value="success">Success (Green)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Duration (TTL)</label>
              <select
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                value={announcementTtl}
                onChange={(e) => setAnnouncementTtl(Number(e.target.value))}
              >
                <option value={0}>No Expiration</option>
                <option value={1}>1 Hour</option>
                <option value={24}>24 Hours</option>
                <option value={168}>1 Week</option>
              </select>
            </div>
            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  checked={announcementEnabled}
                  onChange={(e) => setAnnouncementEnabled(e.target.checked)}
                />
                <span className="text-sm font-medium text-slate-700">Enable Announcement</span>
              </label>
            </div>
          </div>

          <div className="pt-2">
            <p className="text-sm font-medium text-slate-700 mb-2">Preview:</p>
            <div className={`rounded-md p-3 text-sm font-medium text-white ${
              announcementType === "info" ? "bg-blue-600" :
              announcementType === "warning" ? "bg-amber-500" :
              announcementType === "error" ? "bg-red-600" :
              "bg-emerald-600"
            }`}>
              <div dangerouslySetInnerHTML={{ __html: announcementMsg || "<em>No message</em>" }} />
            </div>
          </div>

          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handlePublishAnnouncement}
            disabled={!announcementMsg.trim()}
          >
            Publish Announcement
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Access Control">
        <div className="space-y-4 mt-4">
          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-md bg-slate-50">
            <div>
              <p className="font-medium text-slate-900">Whitelist Mode</p>
              <p className="text-sm text-slate-500">If enabled, only whitelisted users can interact with the platform.</p>
            </div>
            <button
              onClick={handleToggleWhitelistMode}
              disabled={accessUpdating}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isWhitelistMode ? "bg-slate-900" : "bg-slate-300"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isWhitelistMode ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Target Address</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              value={accessTarget}
              onChange={(e) => setAccessTarget(e.target.value)}
              placeholder="G..."
            />
          </div>
          
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              onClick={() => handleAccessAction("addBlacklist")}
              disabled={!accessTarget || accessUpdating}
            >
              Blacklist
            </button>
            <button
              className="rounded-md border border-red-600 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              onClick={() => handleAccessAction("removeBlacklist")}
              disabled={!accessTarget || accessUpdating}
            >
              Un-Blacklist
            </button>
            <div className="w-px bg-slate-200 mx-2" />
            <button
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={() => handleAccessAction("addWhitelist")}
              disabled={!accessTarget || accessUpdating}
            >
              Whitelist
            </button>
            <button
              className="rounded-md border border-slate-900 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => handleAccessAction("removeWhitelist")}
              disabled={!accessTarget || accessUpdating}
            >
              Un-Whitelist
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Feature Flags">
        <div className="mt-4 space-y-3">
          {flagNames.map((name) => (
            <div key={name} className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{name}</p>
                <p className="text-xs text-slate-500">{getFlagDescription(name)}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={featureFlags[name] ?? false}
                aria-label={`Toggle ${name}`}
                onClick={() => {
                  const next = !(featureFlags[name] ?? false);
                  setFlagOverride(name, next);
                  setFeatureFlags((prev) => ({ ...prev, [name]: next }));
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  featureFlags[name] ? "bg-slate-900" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    featureFlags[name] ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-400">
              Overrides stored in localStorage. URL overrides: <code className="rounded bg-slate-100 px-1 text-xs">?feature.flagName=true</code>
            </p>
            <button
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              onClick={() => {
                clearAllOverrides();
                const reset: Record<string, boolean> = {};
                for (const name of flagNames) {
                  reset[name] = false;
                }
                setFeatureFlags(reset);
              }}
            >
              Reset All
            </button>
          </div>
        </div>
      </SectionCard>

      {showWithdrawConfirm && (
        <ConfirmDialog
          open={true}
          title="Withdraw all platform fees?"
          description="This will transfer all accrued platform fees to your admin wallet. The fee balance will be reset to zero."
          consequences={[
            "All accrued fees will be swept to the admin wallet immediately.",
            "The on-chain fee balance will be reset to 0.",
            "This action cannot be reversed.",
          ]}
          impactLine={`${toXlm(fees)} XLM will be transferred to your wallet`}
          confirmLabel="Yes, withdraw fees"
          variant="primary"
          loading={withdrawing}
          suppressKey={CONFIRM_KEYS.withdrawFees}
          onConfirm={() => void handleWithdraw()}
          onCancel={() => setShowWithdrawConfirm(false)}
        />
      )}

      {withdrawals.length > 0 && (
        <SectionCard title="Withdrawal History">
          <div className="mt-2 divide-y divide-slate-100">
            {withdrawals.slice(0, 10).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{tx.amount} XLM</p>
                  <p className="text-xs text-slate-400">
                    {new Date(tx.timestamp).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Completed
                </span>
              </div>
            ))}
          </div>
          {withdrawals.length > 10 && (
            <p className="mt-2 text-xs text-slate-400">
              Showing 10 of {withdrawals.length} withdrawals
            </p>
          )}
        </SectionCard>
      )}

      {/* ── Platform Analytics (#442) ─────────────────────────────────────────── */}
      <SectionCard title="Platform Analytics">
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-slate-200 p-3 text-center">
            <p className="text-2xl font-bold tabular-nums">{jobs.length}</p>
            <p className="text-xs text-slate-500">Total Jobs</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3 text-center">
            <p className="text-2xl font-bold tabular-nums">
              {jobs.filter(({ job }) => job.status === "Completed").length}
            </p>
            <p className="text-xs text-slate-500">Completed</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3 text-center">
            <p className="text-2xl font-bold tabular-nums">
              {jobs.filter(({ job }) => job.status === "Disputed").length}
            </p>
            <p className="text-xs text-slate-500">Disputed</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3 text-center">
            <p className="text-2xl font-bold tabular-nums">
              {jobs.length > 0
                ? `${Math.round(
                    (jobs.filter(({ job }) => job.status === "Completed").length /
                      jobs.length) *
                      100,
                  )}%`
                : "—"}
            </p>
            <p className="text-xs text-slate-500">Completion Rate</p>
          </div>
        </div>
        {jobs.length > 0 && (
          <div className="mt-4 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-500">Total Platform Volume</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {(
                jobs.reduce((sum, { job }) => sum + Number(job.amount), 0) /
                10_000_000
              ).toFixed(2)}{" "}
              <span className="text-base font-normal text-slate-500">XLM</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Across all {jobs.length} posted job{jobs.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Full per-client breakdowns and historical trends are tracked in{" "}
          <a
            href="https://github.com/anumukul/Stellar-work-/issues/442"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-600"
          >
            issue #442
          </a>
          .
        </p>
      </SectionCard>

      <SectionCard title="Job Overview">
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          <div className="rounded-md border border-slate-200 p-3 text-center">
            <p className="text-2xl font-bold">{statusTotal}</p>
            <p className="text-xs text-slate-500">Total</p>
          </div>
          {(Object.keys(STATUS_LABELS) as JobStatus[]).map((status) => {
            const key = STATUS_TO_COUNTS_KEY[status];
            const count = statusCounts[key] ?? 0;
            return (
            <div
              key={status}
              className="rounded-md border border-slate-200 p-3 text-center"
            >
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-slate-500">{STATUS_LABELS[status]}</p>
            </div>
          );
          })}
        </div>
      </SectionCard>

      <SectionCard title="All Jobs">
        {jobs.length === 0 ? (
          <EmptyState
            title="No jobs yet"
            description="Jobs posted to the contract will appear here."
          />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                All jobs with status, participants, amount, and deadline
              </caption>
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th scope="col" className="pb-2 pr-4">ID</th>
                  <th scope="col" className="pb-2 pr-4">Status</th>
                  <th scope="col" className="pb-2 pr-4">Client</th>
                  <th scope="col" className="pb-2 pr-4">Freelancer</th>
                  <th scope="col" className="pb-2 pr-4 text-right">Amount</th>
                  <th scope="col" className="pb-2 pr-4">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(({ id, job }) => (
                  <tr key={id} className="border-b border-slate-100">
                    <th scope="row" className="py-2 pr-4 font-medium">#{id}</th>
                    <td className="py-2 pr-4">
                      <StatusPill status={job.status} />
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      <TruncatedAddress address={job.client} />
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {job.freelancer ? (
                        <TruncatedAddress address={job.freelancer} />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <span className="inline-flex min-w-0 items-baseline justify-end gap-1">
                        <span className="min-w-0 max-w-[10rem] overflow-hidden text-ellipsis whitespace-nowrap tabular-nums">
                          {toXlm(job.amount)}
                        </span>
                        <span className="shrink-0">XLM</span>
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {(() => {
                        const deadline = formatDeadline(job.deadline);
                        if (!deadline) return "None";
                        return `${deadline.isPast ? "Past due" : deadline.relative} • ${deadline.exact}`;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </section>
  );
}
