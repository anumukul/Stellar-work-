"use client";

import {
  Account,
  BASE_FEE,
  Contract,
  rpc,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import {
  type StellarNetwork,
  getNetworkConfig,
  getPersistedNetwork,
} from "@/lib/network-config";
import { getPublicKey } from "@/lib/stellar";
import {
  fetchXlmFiatRates,
  getPreferredFiatCurrency,
  type FiatCurrency,
  type XlmFiatRates,
} from "@/lib/format";
import { fetchWalletTransactions, feeToXlm } from "@/lib/horizon-transactions";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface FeeBreakdown {
  /** Classic base fee in stroops (BASE_FEE × number of operations). */
  baseFeeStroops: bigint;
  /** Soroban computation/resource fee in stroops (simulation `minResourceFee`). */
  resourceFeeStroops: bigint;
  /** Total estimated fee in stroops (base + computation). */
  totalFeeStroops: bigint;
}

export interface RecentFeeComparison {
  /** Number of recent on-chain transactions used for the comparison. */
  count: number;
  /** Average fee of those transactions in stroops. */
  averageFeeStroops: bigint;
  /** Median fee of those transactions in stroops. */
  medianFeeStroops: bigint;
}

export interface FeeEstimate {
  breakdown: FeeBreakdown;
  /** Total estimated fee in XLM (7dp, e.g. "0.0012900"). */
  feeXlm: string;
  /** Total estimated fee in fiat (e.g. "$0.31"), or null when rates are unavailable. */
  feeUsd: string | null;
  /** Currency used for `feeUsd` (user preference, defaults to USD). */
  usdCurrency: FiatCurrency;
  /** Comparison against the wallet's recent on-chain fees, or null. */
  recentComparison: RecentFeeComparison | null;
  /** Set when the estimate is unusually high. */
  highFeeWarning: string | null;
  simulatedAt: number;
}

export interface EstimateTransactionFeeOptions {
  /** Wallet address used as the simulation source. Defaults to the connected wallet. */
  walletAddress?: string;
  /** How many recent transactions to fetch for the fee comparison. */
  recentTxLimit?: number;
}

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

/** Minimum classic fee per operation on Stellar (100 stroops). */
export const BASE_FEE_STROOPS = 100n;
/** Warn when the estimate exceeds this multiple of the recent average fee. */
export const HIGH_FEE_RATIO_THRESHOLD = 2;
/** Absolute fallback threshold (0.05 XLM) when there is no fee history. */
export const ABSOLUTE_HIGH_FEE_STROOPS = 500_000n;
export const RECENT_FEE_TX_LIMIT = 10;

/** Placeholder source used for simulations when no wallet is connected. */
const READONLY_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

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

// ------------------------------------------------------------------
// Pure fee math (unit-testable without a network)
// ------------------------------------------------------------------

/**
 * Split a transaction's total estimated fee into the classic base fee and the
 * Soroban computation (resource) fee. The RPC returns `minResourceFee` for the
 * computation part; the classic base fee is the fee the transaction was built
 * with (100 stroops × operations). The SDK's `assembleTransaction` charges
 * exactly `classicFee + minResourceFee`, so the sum is the fee the user pays.
 */
export function computeFeeBreakdown(
  classicFeeStroops: bigint,
  minResourceFeeStroops: bigint,
): FeeBreakdown {
  const baseFeeStroops = classicFeeStroops >= 0n ? classicFeeStroops : 0n;
  const resourceFeeStroops = minResourceFeeStroops >= 0n ? minResourceFeeStroops : 0n;
  return {
    baseFeeStroops,
    resourceFeeStroops,
    totalFeeStroops: baseFeeStroops + resourceFeeStroops,
  };
}

/**
 * Summarize a list of recent on-chain fees (in stroops) into an average and a
 * median. Returns null when there are no usable entries.
 */
export function computeRecentFeeComparison(
  recentFeeStroops: Array<bigint | string | number>,
): RecentFeeComparison | null {
  const fees = recentFeeStroops
    .map((fee) => (typeof fee === "bigint" ? fee : BigInt(fee)))
    .filter((fee) => fee >= 0n);
  if (fees.length === 0) return null;

  const sorted = [...fees].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const total = fees.reduce((sum, fee) => sum + fee, 0n);
  const averageFeeStroops = total / BigInt(fees.length);
  const mid = Math.floor(sorted.length / 2);
  const medianFeeStroops =
    sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2n;

  return { count: fees.length, averageFeeStroops, medianFeeStroops };
}

/**
 * Estimate relative to the recent average: 1 = same as average, 2 = twice the
 * average, 0.5 = half the average. Null when there is nothing to compare with.
 */
export function computeFeeRatio(
  totalFeeStroops: bigint,
  comparison: RecentFeeComparison | null,
): number | null {
  if (!comparison || comparison.averageFeeStroops <= 0n) return null;
  return Number(totalFeeStroops) / Number(comparison.averageFeeStroops);
}

/**
 * Build a human-readable warning when the estimate is unusually high:
 *  - with fee history: more than `ratioThreshold` × the recent average;
 *  - without history: above an absolute fallback threshold.
 * Returns null when the estimate looks normal.
 */
export function getHighFeeWarning(
  totalFeeStroops: bigint,
  comparison: RecentFeeComparison | null,
  ratioThreshold: number = HIGH_FEE_RATIO_THRESHOLD,
): string | null {
  if (comparison && comparison.averageFeeStroops > 0n) {
    const ratio = Number(totalFeeStroops) / Number(comparison.averageFeeStroops);
    if (ratio > ratioThreshold) {
      const percentAbove = Math.round((ratio - 1) * 100);
      const txLabel = comparison.count === 1 ? "transaction" : "transactions";
      return `This transaction's estimated fee is ${percentAbove}% higher than your recent average of ${feeToXlm(comparison.averageFeeStroops.toString())} XLM across ${comparison.count} ${txLabel}.`;
    }
    return null;
  }

  if (totalFeeStroops > ABSOLUTE_HIGH_FEE_STROOPS) {
    return `This transaction's estimated fee (${feeToXlm(totalFeeStroops.toString())} XLM) is unusually high.`;
  }
  return null;
}

/**
 * Format a fee in stroops as fiat. Uses extra decimal places for very small
 * amounts so fees below one cent are still readable (e.g. "$0.0004").
 */
export function formatFeeUsd(
  stroops: bigint,
  currency: FiatCurrency,
  rates: XlmFiatRates | null | undefined,
): string | null {
  const rate = rates?.[currency];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;

  const usd = (Number(stroops) / 10_000_000) * rate;
  if (!Number.isFinite(usd)) return null;

  const maximumFractionDigits =
    currency === "JPY" ? 0 : usd >= 1 ? 2 : usd > 0 ? 6 : 2;
  const minimumFractionDigits = currency === "JPY" ? 0 : 2;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(usd);
}

// ------------------------------------------------------------------
// Estimation orchestration
// ------------------------------------------------------------------

/**
 * Simulate a Soroban contract call on the RPC to estimate its fee before the
 * user signs anything. The estimate includes:
 *  - the fee breakdown (base + computation) in XLM,
 *  - the total in XLM and fiat (best effort, via cached exchange rates),
 *  - a comparison against the wallet's recent on-chain fees,
 *  - a warning when the estimate is unusually high.
 *
 * Never throws for best-effort sub-steps (fiat rates / recent fees): those
 * degrade to null rather than failing the whole estimate. Throws only when the
 * simulation itself fails, so callers can surface the reason to the user.
 */
export async function estimateTransactionFee(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  options: EstimateTransactionFeeOptions = {},
): Promise<FeeEstimate> {
  const network = getActiveNetwork();
  const config = getNetworkConfig(network);
  const server = new rpc.Server(config.rpcUrl);
  const contract = new Contract(contractId);

  const source = options.walletAddress ?? (await getPublicKey()) ?? READONLY_SOURCE;

  let account: Account;
  try {
    account = await server.getAccount(source);
  } catch {
    account = new Account(source, "0");
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error ?? "Transaction simulation failed.");
  }
  if (!rpc.Api.isSimulationSuccess(simulation) || simulation.minResourceFee == null) {
    throw new Error("Transaction simulation did not return a fee estimate.");
  }

  const breakdown = computeFeeBreakdown(
    tx.fee ? BigInt(tx.fee) : BASE_FEE_STROOPS,
    BigInt(simulation.minResourceFee),
  );
  const simulatedAt = Date.now();

  // Best-effort fiat conversion (cached rates; never fails the estimate).
  const usdCurrency = getPreferredFiatCurrency();
  let feeUsd: string | null = null;
  try {
    const { rates } = await fetchXlmFiatRates();
    feeUsd = formatFeeUsd(breakdown.totalFeeStroops, usdCurrency, rates);
  } catch {
    feeUsd = null;
  }

  // Best-effort comparison against the wallet's recent on-chain fees.
  let recentComparison: RecentFeeComparison | null = null;
  try {
    const { records } = await fetchWalletTransactions(
      source,
      network,
      undefined,
      options.recentTxLimit ?? RECENT_FEE_TX_LIMIT,
    );
    recentComparison = computeRecentFeeComparison(
      records.filter((record) => record.successful).map((record) => record.feeCharged),
    );
  } catch {
    recentComparison = null;
  }

  return {
    breakdown,
    feeXlm: feeToXlm(breakdown.totalFeeStroops.toString()),
    feeUsd,
    usdCurrency,
    recentComparison,
    highFeeWarning: getHighFeeWarning(breakdown.totalFeeStroops, recentComparison),
    simulatedAt,
  };
}
