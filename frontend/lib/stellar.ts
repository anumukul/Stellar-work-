"use client";

import {
  Account,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
  Horizon,
} from "@stellar/stellar-sdk";
import {
  getAddress,
  isAllowed,
  requestAccess,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";
import {
  type StellarNetwork,
  getPersistedNetwork,
  getExplicitNetwork,
  getNetworkConfig,
} from "@/lib/network-config";
import { recordRecentContractInteraction } from "@/lib/recent-contract-interactions";
import { classifyError, reportContractTx, reportRpcError } from "@/lib/metrics-client";

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

const getRpcUrl = () => getNetworkConfig(getActiveNetwork()).rpcUrl;

export type { StellarNetwork };

export function getConfiguredNetwork(): StellarNetwork | null {
  return getExplicitNetwork();
}

const getNetworkPassphrase = () => getNetworkConfig(getActiveNetwork()).passphrase;

export const getNetwork = (): StellarNetwork =>
  getConfiguredNetwork() ?? "testnet";

const DEFAULT_POLL_TIMEOUT = 30000;
const DEFAULT_POLL_INTERVAL = 3000;

// ─── Retry / backoff configuration (Issue #616) ────────────────────────────
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000]; // 1s → 2s → 4s

export { MAX_RETRIES, RETRY_BACKOFF_MS };
// ────────────────────────────────────────────────────────────────────────────

interface TransactionResult {
  status: "SUCCESS" | "ERROR" | "PENDING";
  hash?: string;
  errorResult?: string;
  resultMetaXdr?: string;
  data?: unknown;
}

export async function connectWallet(): Promise<string> {
  const access = await requestAccess();
  if (access.error || !access.address) {
    throw new Error(access.error ?? "Wallet connection was rejected.");
  }
  return access.address;
}

export async function getPublicKey(): Promise<string | null> {
  const allowed = await isAllowed();
  if (!allowed.isAllowed) {
    return null;
  }
  const addr = await getAddress();
  return addr.error ? null : addr.address;
}

export async function getNativeBalance(publicKey: string): Promise<string> {
  try {
    const horizonUrl = getNetworkConfig(getActiveNetwork()).horizonUrl;
    const server = new Horizon.Server(horizonUrl);
    const account = await server.loadAccount(publicKey);
    const nativeBalance = account.balances.find((b) => b.asset_type === "native");
    return nativeBalance ? nativeBalance.balance : "0";
  } catch (e) {
    console.error("Error fetching balance:", e);
    return "0";
  }
}

export async function signTransaction(xdrValue: string): Promise<string> {
  const signed = await freighterSignTransaction(xdrValue, {
    networkPassphrase: getNetworkPassphrase(),
  });
  if ("error" in signed && signed.error) {
    throw new Error(signed.error);
  }
  return "signedTxXdr" in signed ? signed.signedTxXdr : signed;
}

const READONLY_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// ─── Retry helper with exponential backoff (Issue #616) ─────────────────────

/**
 * Retryable error patterns for transient network congestion.
 * Read-only calls (simulations) are not retried — only submit-and-poll flows.
 */
function isRetryableNetworkError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("network") ||
    msg.includes("too many requests") ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("resource limit") ||
    msg.includes("rate limit")
  );
}

/**
 * Wraps an async operation with exponential backoff retry logic.
 *
 * - Only retries transient network/congestion errors (not auth, validation, or
 *   contract-logic errors).
 * - Max {@link MAX_RETRIES} attempts with backoff {@link RETRY_BACKOFF_MS}.
 * - Dispatches `stellar-retry-attempt` custom events on each retry so UI
 *   components can show countdown / attempt indicators.
 * - Fails gracefully after exhaustion with a descriptive error message.
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationLabel: string,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      // Only retry on transient network errors, not on contract-logic failures
      if (!isRetryableNetworkError(err)) {
        throw err;
      }

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
        const nextAttempt = attempt + 1;

        // Dispatch custom event so UI can show retry countdown
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("stellar-retry-attempt", {
              detail: {
                attempt,
                nextAttempt,
                maxRetries: MAX_RETRIES,
                delayMs: delay,
                operation: operationLabel,
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
        }

        console.warn(
          `[Stellar] ${operationLabel} attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delay}ms`,
          (err as Error)?.message,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Exhausted all retries
      console.error(
        `[Stellar] ${operationLabel} failed after ${MAX_RETRIES} attempts`,
        (err as Error)?.message,
      );
      throw new Error(
        `${operationLabel} failed after ${MAX_RETRIES} attempts: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  throw lastError;
}
// ────────────────────────────────────────────────────────────────────────────

/**
 * Instrumented entry point: records invocation outcome and latency for the
 * Prometheus/Grafana dashboards before handing the result back unchanged.
 */
export async function callContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  options?: { readOnly?: boolean; pollTimeout?: number },
): Promise<TransactionResult> {
  const operationLabel = `callContract(${contractId.slice(0, 8)}…, ${method})`;
  const network = getActiveNetwork();
  const startedAt = Date.now();

  try {
    const result = await invokeContract(contractId, method, args, options);
    if (!options?.readOnly) {
      reportContractTx(
        method,
        result.status === "ERROR" ? "error" : "success",
        network,
        Date.now() - startedAt,
      );
    }
    return result;
  } catch (error) {
    reportRpcError(classifyError(error), network);
    if (!options?.readOnly) {
      reportContractTx(method, "error", network, Date.now() - startedAt);
    }
    throw error;
  }
}

async function invokeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  options?: { readOnly?: boolean; pollTimeout?: number },
): Promise<TransactionResult> {
  const server = new rpc.Server(getRpcUrl());
  const networkPassphrase = getNetworkPassphrase();
  const contract = new Contract(contractId);

  // Read-only calls: simulate once, no retry needed
  if (options?.readOnly) {
    const server = new rpc.Server(getRpcUrl());
    const networkPassphrase = getNetworkPassphrase();
    const contract = new Contract(contractId);

    let account;
    const source = await getPublicKey();
    if (source) {
      account = await server.getAccount(source);
    } else {
      account = new Account(READONLY_SOURCE, "0");
    }

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(60)
      .build();

    const simulation = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simulation)) {
      throw new Error(simulation.error);
    }

    if (!rpc.Api.isSimulationSuccess(simulation)) {
      return { status: "ERROR", errorResult: "Simulation failed" };
    }
    const retval = simulation.result?.retval;
    if (!retval) {
      return { status: "ERROR", errorResult: "No return value from simulation" };
    }
    return { status: "SUCCESS", data: scValToNative(retval) };
  }

  // Write calls: wrap in retry for network congestion
  return withRetry(async () => {
    const server = new rpc.Server(getRpcUrl());
    const networkPassphrase = getNetworkPassphrase();
    const contract = new Contract(contractId);

    const source = await getPublicKey();
    if (!source) {
      throw new Error("Connect Freighter before calling contract.");
    }
    const account = await server.getAccount(source);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(60)
      .build();

    const simulation = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simulation)) {
      throw new Error(simulation.error);
    }

    const assembled = rpc.assembleTransaction(tx, simulation).build();
    const prepared = await server.prepareTransaction(assembled);
    const signedXdr = await signTransaction(prepared.toXDR());
    const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
    const sent = await server.sendTransaction(signedTx);

    if (sent.hash) {
      recordRecentContractInteraction({
        hash: sent.hash,
        status: "PENDING",
        timestamp: Date.now(),
        method,
      });
    }

    if (sent.status === "ERROR") {
      if (sent.hash) {
        recordRecentContractInteraction({
          hash: sent.hash,
          status: "ERROR",
          timestamp: Date.now(),
          method,
        });
      }
      throw new Error(sent.errorResult?.toXDR().toString() ?? "Contract invocation failed.");
    }

    if (sent.status === "PENDING") {
      const pollTimeout = options?.pollTimeout ?? DEFAULT_POLL_TIMEOUT;
      const pollInterval = DEFAULT_POLL_INTERVAL;
      const startTime = Date.now();

      while (Date.now() - startTime < pollTimeout) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        const status = await server.getTransaction(sent.hash);

        if (status.status === rpc.Api.GetTransactionStatus.SUCCESS) {
          recordRecentContractInteraction({
            hash: sent.hash,
            status: "SUCCESS",
            timestamp: Date.now(),
            method,
          });
          return { status: "SUCCESS", hash: sent.hash } as TransactionResult;
        }

        if (status.status === rpc.Api.GetTransactionStatus.FAILED) {
          recordRecentContractInteraction({
            hash: sent.hash,
            status: "ERROR",
            timestamp: Date.now(),
            method,
          });
          return {
            status: "ERROR",
            hash: sent.hash,
            errorResult: "Transaction failed.",
          } as TransactionResult;
        }
      }

      throw new Error(
        `Transaction timed out after ${pollTimeout}ms. Hash: ${sent.hash}`,
      );
    }

    return { status: "SUCCESS", hash: sent.hash } as TransactionResult;
  }, method);
}

export function decodeScVal<T = unknown>(value: xdr.ScVal): T {
  return scValToNative(value) as T;
}

export { nativeToScVal, xdr };

export function getExplorerTxUrl(txHash: string): string {
  const base = getNetworkConfig(getActiveNetwork()).explorerUrl;
  return `${base}/${txHash}`;
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/** Stellar account (G…) or contract (C…) StrKey — 56 chars, base32 alphabet. */
const STELLAR_ADDRESS_RE = /^[GC][A-Z2-7]{55}$/;

/**
 * Validates a Stellar address string (account or contract).
 * Matches the format used across profile/messages routes.
 */
export function isValidStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_RE.test(address.trim());
}
