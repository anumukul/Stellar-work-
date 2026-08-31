"use client";

import EmptyState from "@/components/EmptyState";
import ErrorBanner from "@/components/ErrorBanner";
import NoResultsState from "@/components/NoResultsState";
import PullToRefresh from "@/components/PullToRefresh";
import SectionCard from "@/components/SectionCard";
import TransactionRowSkeleton from "@/components/TransactionRowSkeleton";
import TruncatedAddress from "@/components/TruncatedAddress";
import { getJob, getJobCount } from "@/lib/contract";
import { useWallet } from "@/lib/wallet-context";
import {
  ALL_TX_TYPES,
  TX_TYPE_COLORS,
  TX_TYPE_LABELS,
  applyFilters,
  applySortOrder,
  buildTransactionList,
  type SortOrder,
  type Transaction,
  type TransactionFilters,
  type TransactionType,
} from "@/lib/transactions";
import type { Job } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────

const SKELETON_COUNT = 8;

const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_desc", label: "Highest amount" },
  { value: "amount_asc", label: "Lowest amount" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function sumXlm(txns: Transaction[]): string {
  // Sum up incoming flows minus outgoing flows for a net figure.
  let net = 0n;
  for (const tx of txns) {
    if (tx.direction === "incoming") {
      net += tx.amountStroops;
    } else {
      net -= tx.amountStroops;
    }
  }
  const isNeg = net < 0n;
  const abs = isNeg ? -net : net;
  // Convert stroops to XLM (7dp, show 2dp)
  const whole = abs / 10_000_000n;
  const frac = ((abs % 10_000_000n) * 100n) / 10_000_000n;
  return `${isNeg ? "−" : "+"}${whole.toString()}.${frac.toString().padStart(2, "0")}`;
}

// ─── Page component ──────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const { wallet, connectWallet } = useWallet();

  // ── data ──
  const [allJobs, setAllJobs] = useState<Array<{ id: number; job: Job }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── filters ──
  const [selectedTypes, setSelectedTypes] = useState<TransactionType[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  // ── a11y ──
  const announcerRef = useRef<HTMLParagraphElement>(null);

  // ── fetch ────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const count = await getJobCount();
      const results: Array<{ id: number; job: Job }> = [];
      for (let id = 1; id <= count; id++) {
        const job = await getJob(String(id));
        if (job && (job.client === wallet || job.freelancer === wallet)) {
          results.push({ id, job });
        }
      }
      setAllJobs(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    if (wallet) {
      void fetchJobs();
    } else {
      setAllJobs([]);
      setLoading(false);
      setError(null);
    }
  }, [wallet, fetchJobs]);

  // ── derived transactions ─────────────────────────────────────────
  const allTransactions = useMemo(
    () => (wallet ? buildTransactionList(allJobs, wallet) : []),
    [allJobs, wallet],
  );

  const filters: TransactionFilters = useMemo(
    () => ({ types: selectedTypes, dateFrom, dateTo }),
    [selectedTypes, dateFrom, dateTo],
  );

  const filteredTransactions = useMemo(
    () => applySortOrder(applyFilters(allTransactions, filters), sortOrder),
    [allTransactions, filters, sortOrder],
  );

  const hasActiveFilters =
    selectedTypes.length > 0 || dateFrom !== "" || dateTo !== "";

  // ── summary stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const incoming = allTransactions.filter((t) => t.direction === "incoming");
    const outgoing = allTransactions.filter((t) => t.direction === "outgoing");
    return {
      total: allTransactions.length,
      incoming: incoming.length,
      outgoing: outgoing.length,
      netFlow: sumXlm(allTransactions),
    };
  }, [allTransactions]);

  // ── announce results to screen readers ───────────────────────────
  useEffect(() => {
    if (loading || !announcerRef.current) return;
    announcerRef.current.textContent = `${filteredTransactions.length} transaction${filteredTransactions.length !== 1 ? "s" : ""} shown.`;
  }, [filteredTransactions.length, loading]);

  // ── type filter toggle ────────────────────────────────────────────
  function toggleType(type: TransactionType) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  function clearFilters() {
    setSelectedTypes([]);
    setDateFrom("");
    setDateTo("");
  }

  // ── not connected ─────────────────────────────────────────────────
  if (!wallet) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Transaction History</h1>
        <SectionCard className="p-8 text-center">
          <p className="text-slate-600">
            Connect your wallet to view your transaction history.
          </p>
          <button
            className="mt-4 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
            onClick={async () => {
              try {
                await connectWallet();
              } catch {
                /* user cancelled */
              }
            }}
          >
            Connect Wallet
          </button>
        </SectionCard>
      </section>
    );
  }

  // ── render ────────────────────────────────────────────────────────
  return (
    <section className="space-y-6">
      <PullToRefresh onRefresh={fetchJobs} label="Refresh transactions" />

      {/* Live region for screen readers */}
      <p
        ref={announcerRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Transaction History</h1>
        <button
          type="button"
          onClick={() => void fetchJobs()}
          disabled={loading}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onRetry={() => void fetchJobs()}
        />
      )}

      {/* Summary stats */}
      {!loading && allTransactions.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total events" value={String(stats.total)} />
          <StatCard label="Incoming" value={String(stats.incoming)} accent="emerald" />
          <StatCard label="Outgoing" value={String(stats.outgoing)} accent="slate" />
          <StatCard label="Net flow (XLM)" value={stats.netFlow} mono />
        </div>
      )}

      {/* Filters */}
      <SectionCard>
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-slate-900">
            Filters &amp; Sort
          </legend>

          {/* Type chips */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by transaction type">
            <span className="self-center text-xs font-medium text-slate-500 uppercase tracking-wider">
              Type:
            </span>
            {ALL_TX_TYPES.map((type) => {
              const active = selectedTypes.includes(type);
              const colors = TX_TYPE_COLORS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                    active
                      ? `${colors.pill} ring-current`
                      : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {TX_TYPE_LABELS[type]}
                </button>
              );
            })}
            {selectedTypes.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedTypes([])}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                Clear types
              </button>
            )}
          </div>

          {/* Date range */}
          <div className="mt-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span className="w-14 shrink-0 font-medium text-slate-700">From:</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span className="w-14 shrink-0 font-medium text-slate-700">To:</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="self-end rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                Clear dates
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="mt-4 flex items-center gap-3">
            <label
              htmlFor="tx-sort-order"
              className="text-sm font-medium text-slate-700"
            >
              Sort:
            </label>
            <select
              id="tx-sort-order"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      </SectionCard>

      {/* Transaction table */}
      <SectionCard>
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-busy="true" aria-label="Loading transactions">
              <TransactionTableHead />
              <tbody>
                {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                  <TransactionRowSkeleton key={i} />
                ))}
              </tbody>
            </table>
          </div>
        ) : filteredTransactions.length === 0 ? (
          hasActiveFilters ? (
            <NoResultsState
              title="No transactions match your filters"
              description="Try adjusting the type chips or date range, or clear all filters."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          ) : (
            <EmptyState
              title="No transactions yet"
              description="Transactions appear here when you post a job, receive a payment, or get a refund."
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-left text-sm"
              aria-label={`${filteredTransactions.length} transaction${filteredTransactions.length !== 1 ? "s" : ""}`}
            >
              <caption className="sr-only">
                Your transaction history — dates, types, amounts, job links and counterparties
              </caption>
              <TransactionTableHead />
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Result count */}
        {!loading && filteredTransactions.length > 0 && (
          <p className="mt-3 text-xs text-slate-400">
            Showing {filteredTransactions.length} of {allTransactions.length} transaction
            {allTransactions.length !== 1 ? "s" : ""}
            {hasActiveFilters ? " (filters active)" : ""}
          </p>
        )}
      </SectionCard>
    </section>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TransactionTableHead() {
  return (
    <thead>
      <tr className="border-b border-slate-200 text-xs text-slate-500">
        <th scope="col" className="pb-2 pr-4 font-medium">
          Date / Time
        </th>
        <th scope="col" className="pb-2 pr-4 font-medium">
          Type
        </th>
        <th scope="col" className="pb-2 pr-4 text-right font-medium">
          Amount (XLM)
        </th>
        <th scope="col" className="pb-2 pr-4 font-medium">
          Job
        </th>
        <th scope="col" className="pb-2 pr-4 font-medium">
          Counterparty
        </th>
        <th scope="col" className="pb-2 font-medium">
          Status
        </th>
      </tr>
    </thead>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const colors = TX_TYPE_COLORS[tx.type];
  const { date, time } = formatDate(tx.timestamp);
  const sign = tx.direction === "incoming" ? "+" : "−";

  return (
    <tr className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
      {/* Date */}
      <td className="py-3 pr-4 tabular-nums">
        <span className="block text-sm text-slate-800">{date}</span>
        <span className="block text-xs text-slate-400">{time}</span>
      </td>

      {/* Type pill */}
      <td className="py-3 pr-4">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${colors.pill}`}
        >
          <span aria-hidden="true">{colors.icon}</span>
          {TX_TYPE_LABELS[tx.type]}
        </span>
      </td>

      {/* Amount */}
      <td className="py-3 pr-4 text-right tabular-nums">
        <span className={`text-sm font-medium ${colors.amount}`}>
          {sign}
          {tx.amountXlm}
        </span>
      </td>

      {/* Job link */}
      <td className="py-3 pr-4">
        <Link
          href={`/job/${tx.jobId}`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          #{tx.jobId}
        </Link>
      </td>

      {/* Counterparty */}
      <td className="py-3 pr-4">
        {tx.counterparty ? (
          <TruncatedAddress
            address={tx.counterparty}
            className="font-mono text-xs text-slate-500"
          />
        ) : (
          <span className="font-mono text-xs text-slate-500">—</span>
        )}
      </td>

      {/* Status */}
      <td className="py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            tx.status === "confirmed"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {tx.status === "confirmed" ? "Confirmed" : "Pending"}
        </span>
      </td>
    </tr>
  );
}

function StatCard({
  label,
  value,
  accent = "slate",
  mono = false,
}: {
  label: string;
  value: string;
  accent?: "slate" | "emerald";
  mono?: boolean;
}) {
  const valueColor =
    accent === "emerald"
      ? "text-emerald-700"
      : "text-slate-900";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p
        className={`text-xl font-bold tabular-nums ${valueColor} ${mono ? "font-mono text-base" : ""}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}
