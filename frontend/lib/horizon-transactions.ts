"use client";

import {
  type StellarNetwork,
  getNetworkConfig,
  getPersistedNetwork,
} from "@/lib/network-config";
import type { Transaction } from "@/lib/transactions";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface HorizonTransaction {
  /** Transaction hash. */
  hash: string;
  /** Ledger sequence number (confirmation depth). */
  ledger: number;
  /** Fee paid in stroops. */
  feeCharged: string;
  /** Created-at ISO 8601 timestamp from Horizon. */
  createdAt: string;
  /** Timestamp in milliseconds. */
  timestamp: number;
  /** Source account that signed the transaction. */
  sourceAccount: string;
  /** Number of operations in this transaction. */
  operationCount: number;
  /** Whether the transaction succeeded on-chain. */
  successful: boolean;
  /** Memo text if present. */
  memo: string;
  /** Memo type (none, text, id, hash, return). */
  memoType: string;
  /** Paging token for cursor-based pagination. */
  pagingToken: string;
  /** Correlated platform event, if matched. */
  platformEvent?: {
    type: string;
    jobId: number;
    label: string;
  } | null;
}

interface HorizonResponse {
  _embedded: {
    records: Array<{
      hash: string;
      ledger: number;
      fee_charged: string;
      created_at: string;
      source_account: string;
      operation_count: number;
      successful: boolean;
      memo?: string;
      memo_type?: string;
      paging_token: string;
    }>;
  };
  _links: {
    next?: { href: string };
  };
}

// ------------------------------------------------------------------
// Network helpers
// ------------------------------------------------------------------

function getActiveNetwork(): StellarNetwork {
  if (typeof window !== "undefined") {
    return getPersistedNetwork();
  }
  const envNetwork = process.env.NEXT_PUBLIC_NETWORK;
  if (envNetwork === "mainnet" || envNetwork === "testnet" || envNetwork === "futurenet") {
    return envNetwork;
  }
  return "testnet";
}

/**
 * Map network name to the StellarExpert network path segment.
 * StellarExpert uses "public" for mainnet.
 */
function getExplorerNetworkSegment(network: StellarNetwork): string {
  switch (network) {
    case "mainnet":
      return "public";
    case "testnet":
      return "testnet";
    case "futurenet":
      return "futurenet";
  }
}

// ------------------------------------------------------------------
// Explorer URLs
// ------------------------------------------------------------------

/** Deep link to a specific transaction on StellarExpert. */
export function getStellarExpertTxUrl(hash: string): string {
  const segment = getExplorerNetworkSegment(getActiveNetwork());
  return `https://stellar.expert/explorer/${segment}/tx/${hash}`;
}

/** Deep link to an account on StellarExpert. */
export function getStellarExpertAccountUrl(address: string): string {
  const segment = getExplorerNetworkSegment(getActiveNetwork());
  return `https://stellar.expert/explorer/${segment}/account/${address}`;
}

// ------------------------------------------------------------------
// Fetch wallet transactions from Horizon
// ------------------------------------------------------------------

const DEFAULT_LIMIT = 20;

export interface FetchResult {
  records: HorizonTransaction[];
  nextCursor: string | null;
}

/**
 * Fetch paginated transaction history for a Stellar account from Horizon.
 */
export async function fetchWalletTransactions(
  address: string,
  network?: StellarNetwork,
  cursor?: string,
  limit: number = DEFAULT_LIMIT,
): Promise<FetchResult> {
  const net = network ?? getActiveNetwork();
  const { horizonUrl } = getNetworkConfig(net);

  const params = new URLSearchParams({
    order: "desc",
    limit: String(limit),
    include_failed: "true",
  });
  if (cursor) {
    params.set("cursor", cursor);
  }

  const url = `${horizonUrl}/accounts/${address}/transactions?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      // Account not found on this network — return empty
      return { records: [], nextCursor: null };
    }
    throw new Error(`Horizon API error: ${response.status} ${response.statusText}`);
  }

  const data: HorizonResponse = await response.json();

  const records: HorizonTransaction[] = data._embedded.records.map((r) => ({
    hash: r.hash,
    ledger: r.ledger,
    feeCharged: r.fee_charged,
    createdAt: r.created_at,
    timestamp: new Date(r.created_at).getTime(),
    sourceAccount: r.source_account,
    operationCount: r.operation_count,
    successful: r.successful,
    memo: r.memo ?? "",
    memoType: r.memo_type ?? "none",
    pagingToken: r.paging_token,
    platformEvent: null,
  }));

  // Determine if there are more pages
  const nextCursor =
    records.length >= limit ? records[records.length - 1]?.pagingToken ?? null : null;

  return { records, nextCursor };
}

// ------------------------------------------------------------------
// Correlation: match Horizon transactions with platform events
// ------------------------------------------------------------------

/** Time window (ms) for correlating on-chain txs with platform events. */
const CORRELATION_WINDOW_MS = 60_000; // 60 seconds

/**
 * Best-effort correlation between Horizon transactions and platform-derived
 * transaction events. Matches by timestamp proximity since the platform does
 * not store on-chain transaction hashes.
 */
export function correlateWithPlatformEvents(
  horizonTxs: HorizonTransaction[],
  platformTxs: Transaction[],
): HorizonTransaction[] {
  if (platformTxs.length === 0) return horizonTxs;

  // Sort platform txs by timestamp for efficient scanning
  const sorted = [...platformTxs].sort((a, b) => a.timestamp - b.timestamp);

  return horizonTxs.map((htx) => {
    // Find the closest platform event within the correlation window
    let bestMatch: Transaction | null = null;
    let bestDelta = Infinity;

    for (const ptx of sorted) {
      const delta = Math.abs(htx.timestamp - ptx.timestamp);
      if (delta < bestDelta && delta <= CORRELATION_WINDOW_MS) {
        bestDelta = delta;
        bestMatch = ptx;
      }
      // Early exit: if we've passed the window, stop
      if (ptx.timestamp > htx.timestamp + CORRELATION_WINDOW_MS) break;
    }

    if (bestMatch) {
      return {
        ...htx,
        platformEvent: {
          type: bestMatch.type,
          jobId: bestMatch.jobId,
          label:
            bestMatch.type === "job_posted"
              ? "Job Posted"
              : bestMatch.type === "payment_received"
                ? "Payment Received"
                : bestMatch.type === "fee_deducted"
                  ? "Fee Deducted"
                  : bestMatch.type === "refund_received"
                    ? "Refund Received"
                    : "Dispute",
        },
      };
    }

    return htx;
  });
}

// ------------------------------------------------------------------
// Fee helpers
// ------------------------------------------------------------------

/** Convert stroops fee string to a human-readable XLM string (7dp). */
export function feeToXlm(stroops: string): string {
  const n = BigInt(stroops);
  const whole = n / 10_000_000n;
  const frac = n % 10_000_000n;
  return `${whole}.${frac.toString().padStart(7, "0")}`;
}

// ------------------------------------------------------------------
// CSV Export
// ------------------------------------------------------------------

export interface CSVExportRow {
  date: string;
  hash: string;
  type: string;
  fee: string;
  source: string;
  ledger: number;
  status: string;
  memo: string;
  platformEvent: string;
  stellarExpertUrl: string;
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate a CSV string from Horizon transactions.
 */
export function exportTransactionsToCSV(txs: HorizonTransaction[]): string {
  const header = [
    "Date",
    "Hash",
    "Type",
    "Fee (XLM)",
    "Source Account",
    "Ledger",
    "Status",
    "Memo",
    "Platform Event",
    "StellarExpert URL",
  ].join(",");

  const rows = txs.map((tx) => {
    const row: CSVExportRow = {
      date: tx.createdAt,
      hash: tx.hash,
      type: tx.operationCount === 1 ? "Single Op" : `${tx.operationCount} Ops`,
      fee: feeToXlm(tx.feeCharged),
      source: tx.sourceAccount,
      ledger: tx.ledger,
      status: tx.successful ? "Success" : "Failed",
      memo: tx.memo || "",
      platformEvent: tx.platformEvent
        ? `${tx.platformEvent.label} (Job #${tx.platformEvent.jobId})`
        : "",
      stellarExpertUrl: getStellarExpertTxUrl(tx.hash),
    };

    return [
      escapeCSV(row.date),
      escapeCSV(row.hash),
      escapeCSV(row.type),
      escapeCSV(row.fee),
      escapeCSV(row.source),
      String(row.ledger),
      escapeCSV(row.status),
      escapeCSV(row.memo),
      escapeCSV(row.platformEvent),
      escapeCSV(row.stellarExpertUrl),
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

/**
 * Trigger a file download in the browser.
 */
export function triggerCSVDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
