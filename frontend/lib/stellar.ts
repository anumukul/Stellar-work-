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
  getNetwork as getFreighterNetwork,
  requestAccess,
  signTransaction as freighterSignTransaction,
  WatchWalletChanges,
} from "@stellar/freighter-api";
import {
  type StellarNetwork,
  getPersistedNetwork,
  getExplicitNetwork,
  getNetworkConfig,
} from "@/lib/network-config";
import { recordRecentContractInteraction } from "@/lib/recent-contract-interactions";
import { classifyError, reportContractTx, reportRpcError } from "@/lib/metrics-client";
import { describeContractError } from "./contract-errors";
import {
  decodeQueuedArgs,
  DEFAULT_RETRY_CONFIG,
  getRetryConfig,
  loadFailedWriteQueue,
  removeQueuedWrite,
  withContractRetry,
  type RetryConfig,
} from "./contract-retry";

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

const FREIGHTER_NETWORK_BY_NAME: Record<string, StellarNetwork> = {
  TESTNET: "testnet",
  FUTURENET: "futurenet",
  PUBLIC: "mainnet",
  MAINNET: "mainnet",
};

export function normalizeFreighterNetwork(
  network?: string,
  networkPassphrase?: string,
): StellarNetwork | null {
  if (network) {
    const normalized = FREIGHTER_NETWORK_BY_NAME[network.toUpperCase()];
    if (normalized) return normalized;
  }

  if (networkPassphrase) {
    const match = (["testnet", "futurenet", "mainnet"] as const).find(
      (candidate) => getNetworkConfig(candidate).passphrase === networkPassphrase,
    );
    if (match) return match;
  }

  return null;
}

export async function getWalletNetwork(): Promise<StellarNetwork | null> {
  const walletNetwork = await getFreighterNetwork();
  if (walletNetwork.error) {
    return null;
  }
  return normalizeFreighterNetwork(
    walletNetwork.network,
    walletNetwork.networkPassphrase,
  );
}

export function watchWalletNetworkChanges(
  onChange: (snapshot: { address: string; network: StellarNetwork | null }) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const watcher = new WatchWalletChanges(3000);
  watcher.watch(({ address, network, networkPassphrase, error }) => {
    if (error) return;
    onChange({
      address,
      network: normalizeFreighterNetwork(network, networkPassphrase),
    });
  });

  return () => watcher.stop();
}

export function getConfiguredNetwork(): StellarNetwork | null {
  return getExplicitNetwork();
}

const getNetworkPassphrase = () => getNetworkConfig(getActiveNetwork()).passphrase;

export const getNetwork = (): StellarNetwork =>
  getConfiguredNetwork() ?? "testnet";

const DEFAULT_POLL_TIMEOUT = 30000;
const DEFAULT_POLL_INTERVAL = 3000;

// ─── Retry / backoff configuration (Issue #616 / FE-186) ───────────────────
export function getContractRetryConfig(): RetryConfig {
  return getRetryConfig();
}

export const MAX_RETRIES = DEFAULT_RETRY_CONFIG.maxRetries;
export const RETRY_BACKOFF_MS = DEFAULT_RETRY_CONFIG.backoffMs;
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

/** Re-process locally queued failed contract writes (FE-186). */
export async function retryQueuedWrites(): Promise<{ succeeded: number; failed: number }> {
  const queue = loadFailedWriteQueue();
  let succeeded = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const args = decodeQueuedArgs(item.argsXdr);
      const result = await callContract(item.contractId, item.method, args);
      if (result.status === "ERROR") {
        failed += 1;
        continue;
      }
      removeQueuedWrite(item.id);
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }

  return { succeeded, failed };
}

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

async function simulateReadContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<TransactionResult> {
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

async function submitWriteContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  options?: { pollTimeout?: number },
): Promise<TransactionResult> {
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
      const txStatus = await server.getTransaction(sent.hash);

      if (txStatus.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        recordRecentContractInteraction({
          hash: sent.hash,
          status: "SUCCESS",
          timestamp: Date.now(),
          method,
        });
        return {
          status: "SUCCESS",
          hash: sent.hash,
          data: txStatus.returnValue ? scValToNative(txStatus.returnValue) : undefined,
        };
      }

      if (txStatus.status === rpc.Api.GetTransactionStatus.FAILED) {
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
        };
      }
    }

    throw new Error(
      `Transaction timed out after ${pollTimeout}ms. Hash: ${sent.hash}`,
    );
  }

  return { status: "SUCCESS", hash: sent.hash };
}

async function invokeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  options?: { readOnly?: boolean; pollTimeout?: number },
): Promise<TransactionResult> {
  const operationLabel = `${options?.readOnly ? "read" : "write"}:${method}`;

  if (options?.readOnly) {
    return withContractRetry(
      () => simulateReadContract(contractId, method, args),
      operationLabel,
      { readOnly: true },
    );
  }

  return withContractRetry(
    () => submitWriteContract(contractId, method, args, options),
    operationLabel,
    { readOnly: false, contractId, method, args },
  );
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

// ─── Contract Error Parser (Issue #620) ──────────────────────────────────────

/**
 * Mapping from Soroban / Stellar error patterns to user-friendly messages.
 *
 * Soroban emits errors in several formats depending on where they originate:
 *  - `HostError: Error(Contract, #N)` — contract-defined error codes
 *  - `insufficient balance` / `balance` — token contract balance errors
 *  - `op_underfunded` — Horizon transaction result code
 *  - `tx_insufficient_fee` — fee account is underfunded
 *  - simulation errors that include the phrase "balance" or "amount"
 *
 * This utility normalises all of them to readable sentences.
 */
export function parseContractError(error: unknown, currentBalance?: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const lower = raw.toLowerCase();

  // ── Insufficient balance patterns ────────────────────────────────────────
  if (
    lower.includes("insufficient balance") ||
    lower.includes("balance is not sufficient") ||
    lower.includes("op_underfunded") ||
    lower.includes("underfunded") ||
    // Soroban SAC (Stellar Asset Contract) emits Error(Contract, #10) for balance
    /error\(contract,\s*#10\)/.test(lower) ||
    // Generic "balance" near "error" or "fail"
    (lower.includes("balance") && (lower.includes("fail") || lower.includes("error") || lower.includes("insufficient")))
  ) {
    if (currentBalance !== undefined) {
      return `Insufficient balance. Your current balance is ${currentBalance} XLM. Please add funds and try again.`;
    }
    return "Insufficient balance. Please add funds to your wallet and try again.";
  }

  // ── Contract error codes ──────────────────────────────────────────────────
  // Delegated to the catalogue in lib/contract-errors.ts, which is the single
  // source of truth and is checked against contracts/escrow/src/lib.rs by
  // __tests__/contract-errors.test.ts. The map that used to live here had
  // drifted: it reported code 1 as "Not authorized" and code 2 as "Job not
  // found" when the contract defines exactly the reverse (#761).
  const described = describeContractError(error);
  if (described) {
    return `${described.message} ${described.action}`;
  }

  // ── Wallet / signing errors ───────────────────────────────────────────────
  if (lower.includes("user declined") || lower.includes("user rejected") || lower.includes("cancelled")) {
    return "Transaction was cancelled.";
  }
  if (lower.includes("connect freighter") || lower.includes("wallet") && lower.includes("connect")) {
    return "Please connect your Freighter wallet and try again.";
  }

  // ── Fee errors ────────────────────────────────────────────────────────────
  if (lower.includes("tx_insufficient_fee") || lower.includes("insufficient fee")) {
    return "Transaction fee is too low. Please try again — the fee will be adjusted automatically.";
  }

  // ── Retry exhaustion / circuit breaker (FE-186) ───────────────────────────
  if (/failed after \d+ attempts/.test(lower)) {
    return "The network request failed after several retries. Please wait a moment and try again.";
  }
  if (lower.includes("circuit breaker")) {
    return "Too many RPC failures — contract calls are paused briefly. Please wait and retry.";
  }

  // ── Network / timeout errors ──────────────────────────────────────────────
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "The transaction timed out. Please check your network connection and try again.";
  }
  if (lower.includes("econnrefused") || lower.includes("network") || lower.includes("fetch")) {
    return "Network error. Please check your connection and try again.";
  }

  // ── Fallback: return the original message but trim XDR noise ─────────────
  // Strip raw XDR blobs and long hex strings to keep messages readable.
  const trimmed = raw.replace(/[A-Za-z0-9+/]{60,}={0,2}/g, "[data]").slice(0, 200);
  return trimmed || "Transaction failed. Please try again.";
}
// ─────────────────────────────────────────────────────────────────────────────
