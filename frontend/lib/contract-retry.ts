"use client";

import { xdr } from "@stellar/stellar-sdk";

// ─── Events ───────────────────────────────────────────────────────────────────

export const CONTRACT_RETRY_EVENT = "stellar-retry-attempt";
export const CIRCUIT_OPEN_EVENT = "stellar-circuit-open";
export const FAILED_WRITE_QUEUE_EVENT = "stellarwork:failed-write-queue-updated";

export type RetryEventPhase = "backoff" | "exhausted" | "circuit_open";

export interface ContractRetryEventDetail {
  phase: RetryEventPhase;
  attempt: number;
  nextAttempt: number;
  maxRetries: number;
  delayMs: number;
  operation: string;
  error?: string;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface RetryConfig {
  maxRetries: number;
  backoffMs: number[];
  circuitBreakerEnabled: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerCooldownMs: number;
  queueFailedWrites: boolean;
}

const CONFIG_KEY = "stellarwork:contract-retry-config";
const CIRCUIT_KEY = "stellarwork:circuit-breaker-state";
const QUEUE_KEY = "stellarwork:failed-write-queue";

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffMs: [1000, 2000, 4000],
  circuitBreakerEnabled: true,
  circuitBreakerThreshold: 5,
  circuitBreakerCooldownMs: 30000,
  queueFailedWrites: true,
};

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseEnvBackoff(): number[] | null {
  const raw = process.env.NEXT_PUBLIC_CONTRACT_RETRY_BACKOFF_MS;
  if (!raw) return null;
  const parts = raw.split(",").map((s) => Number.parseInt(s.trim(), 10));
  if (parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  return parts;
}

function envDefaults(): Partial<RetryConfig> {
  const backoff = parseEnvBackoff();
  return {
    maxRetries: parseEnvInt("NEXT_PUBLIC_CONTRACT_RETRY_MAX", DEFAULT_RETRY_CONFIG.maxRetries),
    backoffMs: backoff ?? DEFAULT_RETRY_CONFIG.backoffMs,
  };
}

export function getRetryConfig(): RetryConfig {
  const base = { ...DEFAULT_RETRY_CONFIG, ...envDefaults() };
  if (typeof window === "undefined") return base;

  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return base;
    const stored = JSON.parse(raw) as Partial<RetryConfig>;
    return {
      ...base,
      ...stored,
      backoffMs: stored.backoffMs?.length ? stored.backoffMs : base.backoffMs,
    };
  } catch {
    return base;
  }
}

export function saveRetryConfig(patch: Partial<RetryConfig>): RetryConfig {
  const next = { ...getRetryConfig(), ...patch };
  if (typeof window !== "undefined") {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  }
  return next;
}

export function resetRetryConfig(): RetryConfig {
  if (typeof window !== "undefined") {
    localStorage.removeItem(CONFIG_KEY);
  }
  return getRetryConfig();
}

// ─── Retryable errors ─────────────────────────────────────────────────────────

export function isRetryableNetworkError(err: unknown): boolean {
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
    msg.includes("rate limit") ||
    msg.includes("circuit breaker")
  );
}

// ─── Circuit breaker ──────────────────────────────────────────────────────────

interface CircuitState {
  consecutiveFailures: number;
  openedAt: number | null;
}

function loadCircuitState(): CircuitState {
  if (typeof window === "undefined") {
    return { consecutiveFailures: 0, openedAt: null };
  }
  try {
    const raw = localStorage.getItem(CIRCUIT_KEY);
    if (!raw) return { consecutiveFailures: 0, openedAt: null };
    const parsed = JSON.parse(raw) as CircuitState;
    return {
      consecutiveFailures: parsed.consecutiveFailures ?? 0,
      openedAt: parsed.openedAt ?? null,
    };
  } catch {
    return { consecutiveFailures: 0, openedAt: null };
  }
}

function saveCircuitState(state: CircuitState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CIRCUIT_KEY, JSON.stringify(state));
}

export function resetCircuitBreaker(): void {
  saveCircuitState({ consecutiveFailures: 0, openedAt: null });
}

export function isCircuitOpen(): boolean {
  const config = getRetryConfig();
  if (!config.circuitBreakerEnabled) return false;

  const state = loadCircuitState();
  if (!state.openedAt) return false;

  const elapsed = Date.now() - state.openedAt;
  if (elapsed >= config.circuitBreakerCooldownMs) {
    saveCircuitState({ consecutiveFailures: 0, openedAt: null });
    return false;
  }
  return true;
}

export function getCircuitCooldownRemainingMs(): number {
  const config = getRetryConfig();
  const state = loadCircuitState();
  if (!state.openedAt) return 0;
  return Math.max(0, config.circuitBreakerCooldownMs - (Date.now() - state.openedAt));
}

function recordCircuitSuccess(): void {
  saveCircuitState({ consecutiveFailures: 0, openedAt: null });
}

function recordCircuitFailure(operationLabel: string, err: unknown): void {
  const config = getRetryConfig();
  if (!config.circuitBreakerEnabled) return;

  const state = loadCircuitState();
  const consecutiveFailures = state.openedAt ? config.circuitBreakerThreshold : state.consecutiveFailures + 1;

  if (consecutiveFailures >= config.circuitBreakerThreshold) {
    const openedAt = Date.now();
    saveCircuitState({ consecutiveFailures: config.circuitBreakerThreshold, openedAt });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(CIRCUIT_OPEN_EVENT, {
          detail: {
            operation: operationLabel,
            cooldownMs: config.circuitBreakerCooldownMs,
            error: err instanceof Error ? err.message : String(err),
          },
        }),
      );
      window.dispatchEvent(
        new CustomEvent(CONTRACT_RETRY_EVENT, {
          detail: {
            phase: "circuit_open",
            attempt: 0,
            nextAttempt: 0,
            maxRetries: config.maxRetries,
            delayMs: config.circuitBreakerCooldownMs,
            operation: operationLabel,
            error: err instanceof Error ? err.message : String(err),
          } satisfies ContractRetryEventDetail,
        }),
      );
    }
  } else {
    saveCircuitState({ consecutiveFailures, openedAt: null });
  }
}

// ─── Failed write queue ───────────────────────────────────────────────────────

export interface QueuedWrite {
  id: string;
  contractId: string;
  method: string;
  argsXdr: string[];
  timestamp: number;
  lastError: string;
}

export function loadFailedWriteQueue(): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is QueuedWrite =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as QueuedWrite).id === "string" &&
        typeof (entry as QueuedWrite).contractId === "string" &&
        typeof (entry as QueuedWrite).method === "string" &&
        Array.isArray((entry as QueuedWrite).argsXdr),
    );
  } catch {
    return [];
  }
}

function emitQueueUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FAILED_WRITE_QUEUE_EVENT));
}

export function enqueueFailedWrite(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  lastError: string,
): QueuedWrite | null {
  const config = getRetryConfig();
  if (!config.queueFailedWrites) return null;

  const entry: QueuedWrite = {
    id: `${Date.now()}-${method}`,
    contractId,
    method,
    argsXdr: args.map((arg) => arg.toXDR("base64")),
    timestamp: Date.now(),
    lastError,
  };

  const queue = loadFailedWriteQueue();
  const next = [entry, ...queue.filter((q) => q.id !== entry.id)].slice(0, 10);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  emitQueueUpdated();
  return entry;
}

export function removeQueuedWrite(id: string): void {
  const next = loadFailedWriteQueue().filter((q) => q.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  emitQueueUpdated();
}

export function clearFailedWriteQueue(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(QUEUE_KEY);
  emitQueueUpdated();
}

export function decodeQueuedArgs(argsXdr: string[]): xdr.ScVal[] {
  return argsXdr.map((encoded) => xdr.ScVal.fromXDR(encoded, "base64"));
}

function dispatchRetryEvent(detail: ContractRetryEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONTRACT_RETRY_EVENT, { detail }));
}

// ─── withRetry ────────────────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor(public cooldownMs: number) {
    super(`RPC circuit breaker open — retry in ${Math.ceil(cooldownMs / 1000)}s`);
    this.name = "CircuitOpenError";
  }
}

/**
 * Wraps an async operation with configurable exponential backoff, circuit
 * breaker, and optional failed-write queueing (writes only).
 */
export async function withContractRetry<T>(
  operation: () => Promise<T>,
  operationLabel: string,
  options?: {
    readOnly?: boolean;
    contractId?: string;
    method?: string;
    args?: xdr.ScVal[];
  },
): Promise<T> {
  if (isCircuitOpen()) {
    const cooldownMs = getCircuitCooldownRemainingMs();
    throw new CircuitOpenError(cooldownMs);
  }

  const config = getRetryConfig();
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await operation();
      recordCircuitSuccess();
      return result;
    } catch (err) {
      lastError = err;

      if (!isRetryableNetworkError(err)) {
        throw err;
      }

      if (attempt < config.maxRetries) {
        const delay =
          config.backoffMs[attempt - 1] ??
          config.backoffMs[config.backoffMs.length - 1] ??
          1000;
        const nextAttempt = attempt + 1;

        dispatchRetryEvent({
          phase: "backoff",
          attempt,
          nextAttempt,
          maxRetries: config.maxRetries,
          delayMs: delay,
          operation: operationLabel,
          error: err instanceof Error ? err.message : String(err),
        });

        console.warn(
          `[Stellar] ${operationLabel} attempt ${attempt}/${config.maxRetries} failed, retrying in ${delay}ms`,
          (err as Error)?.message,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      recordCircuitFailure(operationLabel, err);

      dispatchRetryEvent({
        phase: "exhausted",
        attempt,
        nextAttempt: attempt,
        maxRetries: config.maxRetries,
        delayMs: 0,
        operation: operationLabel,
        error: err instanceof Error ? err.message : String(err),
      });

      if (
        !options?.readOnly &&
        options?.contractId &&
        options?.method &&
        options?.args
      ) {
        enqueueFailedWrite(
          options.contractId,
          options.method,
          options.args,
          err instanceof Error ? err.message : String(err),
        );
      }

      console.error(
        `[Stellar] ${operationLabel} failed after ${config.maxRetries} attempts`,
        (err as Error)?.message,
      );
      throw new Error(
        `${operationLabel} failed after ${config.maxRetries} attempts: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  throw lastError;
}
