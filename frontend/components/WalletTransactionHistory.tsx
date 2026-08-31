"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  type HorizonTransaction,
  type FetchResult,
  fetchWalletTransactions,
  correlateWithPlatformEvents,
  getStellarExpertTxUrl,
  getStellarExpertAccountUrl,
  feeToXlm,
} from "@/lib/horizon-transactions";
import type { Transaction } from "@/lib/transactions";
import ErrorBanner from "@/components/ErrorBanner";
import TransactionRowSkeleton from "@/components/TransactionRowSkeleton";
import TruncatedAddress from "@/components/TruncatedAddress";
import EmptyState from "@/components/EmptyState";

// ─── Constants ──────────────────────────────────────────────────────────────

const SKELETON_COUNT = 6;

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

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface WalletTransactionHistoryProps {
  wallet: string;
  platformTransactions: Transaction[];
}

export default function WalletTransactionHistory({
  wallet,
  platformTransactions,
}: WalletTransactionHistoryProps) {
  const [transactions, setTransactions] = useState<HorizonTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // ── Initial fetch ──
  const fetchInitial = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    setTransactions([]);
    setNextCursor(null);
    try {
      const result: FetchResult = await fetchWalletTransactions(wallet);
      const correlated = correlateWithPlatformEvents(
        result.records,
        platformTransactions,
      );
      setTransactions(correlated);
      setNextCursor(result.nextCursor);
      setInitialLoaded(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load wallet transactions.",
      );
    } finally {
      setLoading(false);
    }
  }, [wallet, platformTransactions]);

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  // ── Load more ──
  const loadMore = useCallback(async () => {
    if (!wallet || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result: FetchResult = await fetchWalletTransactions(
        wallet,
        undefined,
        nextCursor,
      );
      const correlated = correlateWithPlatformEvents(
        result.records,
        platformTransactions,
      );
      setTransactions((prev) => [...prev, ...correlated]);
      setNextCursor(result.nextCursor);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load more transactions.",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [wallet, nextCursor, loadingMore, platformTransactions]);

  // ── Correlated view ──
  const correlated = useMemo(
    () => transactions,
    [transactions],
  );

  // ── Loading state ──
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table
          className="w-full text-left text-sm"
          aria-busy="true"
          aria-label="Loading wallet transactions"
        >
          <WalletTxTableHead />
          <tbody>
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <TransactionRowSkeleton key={i} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <ErrorBanner
        message={error}
        onDismiss={() => setError(null)}
        onRetry={() => void fetchInitial()}
      />
    );
  }

  // ── Empty state ──
  if (initialLoaded && correlated.length === 0) {
    return (
      <EmptyState
        title="No on-chain transactions found"
        description="This wallet has no transaction history on the current Stellar network."
      />
    );
  }

  // ── Table ──
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Showing {correlated.length} on-chain transaction
          {correlated.length !== 1 ? "s" : ""}
        </p>
        <a
          href={getStellarExpertAccountUrl(wallet)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          View full account on StellarExpert ↗
        </a>
      </div>

      <div className="overflow-x-auto">
        <table
          className="w-full text-left text-sm"
          aria-label={`${correlated.length} wallet transaction${correlated.length !== 1 ? "s" : ""}`}
        >
          <caption className="sr-only">
            On-chain wallet transactions — dates, hashes, fees, ledger,
            status, and linked platform events
          </caption>
          <WalletTxTableHead />
          <tbody className="divide-y divide-slate-100">
            {correlated.map((tx) => (
              <WalletTxRow key={tx.hash} tx={tx} wallet={wallet} />
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function WalletTxTableHead() {
  return (
    <thead>
      <tr className="border-b border-slate-200 text-xs text-slate-500">
        <th scope="col" className="pb-2 pr-4 font-medium">
          Date / Time
        </th>
        <th scope="col" className="pb-2 pr-4 font-medium">
          Hash
        </th>
        <th scope="col" className="pb-2 pr-4 text-right font-medium">
          Fee (XLM)
        </th>
        <th scope="col" className="pb-2 pr-4 font-medium">
          Source
        </th>
        <th scope="col" className="pb-2 pr-4 text-right font-medium">
          Ledger
        </th>
        <th scope="col" className="pb-2 pr-4 font-medium">
          Status
        </th>
        <th scope="col" className="pb-2 font-medium">
          Platform Event
        </th>
      </tr>
    </thead>
  );
}

function WalletTxRow({
  tx,
  wallet,
}: {
  tx: HorizonTransaction;
  wallet: string;
}) {
  const { date, time } = formatDate(tx.timestamp);
  const isSelf = tx.sourceAccount === wallet;

  return (
    <tr className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
      {/* Date */}
      <td className="py-3 pr-4 tabular-nums">
        <span className="block text-sm text-slate-800">{date}</span>
        <span className="block text-xs text-slate-400">{time}</span>
      </td>

      {/* Hash — links to StellarExpert */}
      <td className="py-3 pr-4">
        <a
          href={getStellarExpertTxUrl(tx.hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-blue-600 hover:underline"
          title={tx.hash}
        >
          {truncateHash(tx.hash)}
        </a>
      </td>

      {/* Fee */}
      <td className="py-3 pr-4 text-right tabular-nums">
        <span className="text-sm text-slate-700">{feeToXlm(tx.feeCharged)}</span>
      </td>

      {/* Source */}
      <td className="py-3 pr-4">
        {isSelf ? (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
              You
            </span>
          </span>
        ) : (
          <TruncatedAddress
            address={tx.sourceAccount}
            className="font-mono text-xs text-slate-500"
          />
        )}
      </td>

      {/* Ledger */}
      <td className="py-3 pr-4 text-right tabular-nums">
        <span className="text-sm text-slate-700">
          {tx.ledger.toLocaleString()}
        </span>
      </td>

      {/* Status */}
      <td className="py-3 pr-4">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            tx.successful
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {tx.successful ? "Success" : "Failed"}
        </span>
      </td>

      {/* Platform Event */}
      <td className="py-3">
        {tx.platformEvent ? (
          <Link
            href={`/job/${tx.platformEvent.jobId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
          >
            {tx.platformEvent.label}
            <span className="text-slate-400">#{tx.platformEvent.jobId}</span>
          </Link>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}
