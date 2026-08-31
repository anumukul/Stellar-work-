"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CIRCUIT_OPEN_EVENT,
  CONTRACT_RETRY_EVENT,
  FAILED_WRITE_QUEUE_EVENT,
  getCircuitCooldownRemainingMs,
  isCircuitOpen,
  loadFailedWriteQueue,
  type ContractRetryEventDetail,
} from "@/lib/contract-retry";

export interface ContractRetryStatus {
  isRetrying: boolean;
  attempt: number;
  maxRetries: number;
  countdownMs: number;
  operation: string;
  phase: ContractRetryEventDetail["phase"] | null;
  circuitOpen: boolean;
  circuitCooldownMs: number;
  queuedWriteCount: number;
}

const IDLE: ContractRetryStatus = {
  isRetrying: false,
  attempt: 0,
  maxRetries: 0,
  countdownMs: 0,
  operation: "",
  phase: null,
  circuitOpen: false,
  circuitCooldownMs: 0,
  queuedWriteCount: 0,
};

export function useContractRetryStatus(): ContractRetryStatus {
  const [status, setStatus] = useState<ContractRetryStatus>(() => ({
    ...IDLE,
    circuitOpen: isCircuitOpen(),
    circuitCooldownMs: getCircuitCooldownRemainingMs(),
    queuedWriteCount: loadFailedWriteQueue().length,
  }));

  const refreshCircuit = useCallback(() => {
    setStatus((prev) => ({
      ...prev,
      circuitOpen: isCircuitOpen(),
      circuitCooldownMs: getCircuitCooldownRemainingMs(),
      queuedWriteCount: loadFailedWriteQueue().length,
    }));
  }, []);

  useEffect(() => {
    let countdownTimer: ReturnType<typeof setInterval> | null = null;
    let backoffTimer: ReturnType<typeof setTimeout> | null = null;

    const onRetry = (event: Event) => {
      const detail = (event as CustomEvent<ContractRetryEventDetail>).detail;
      if (!detail) return;

      if (detail.phase === "exhausted") {
        if (countdownTimer) clearInterval(countdownTimer);
        if (backoffTimer) clearTimeout(backoffTimer);
        setStatus((prev) => ({
          ...prev,
          isRetrying: false,
          phase: "exhausted",
          attempt: detail.attempt,
          maxRetries: detail.maxRetries,
          countdownMs: 0,
          operation: detail.operation,
          queuedWriteCount: loadFailedWriteQueue().length,
        }));
        return;
      }

      if (detail.phase === "circuit_open") {
        if (countdownTimer) clearInterval(countdownTimer);
        if (backoffTimer) clearTimeout(backoffTimer);
        setStatus((prev) => ({
          ...prev,
          isRetrying: false,
          phase: "circuit_open",
          circuitOpen: true,
          circuitCooldownMs: detail.delayMs,
          operation: detail.operation,
        }));
        return;
      }

      if (detail.phase === "backoff") {
        let remaining = detail.delayMs;
        setStatus((prev) => ({
          ...prev,
          isRetrying: true,
          phase: "backoff",
          attempt: detail.nextAttempt,
          maxRetries: detail.maxRetries,
          countdownMs: remaining,
          operation: detail.operation,
        }));

        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = setInterval(() => {
          remaining = Math.max(0, remaining - 100);
          setStatus((prev) =>
            prev.isRetrying ? { ...prev, countdownMs: remaining } : prev,
          );
        }, 100);

        if (backoffTimer) clearTimeout(backoffTimer);
        backoffTimer = setTimeout(() => {
          setStatus((prev) =>
            prev.phase === "backoff" ? { ...prev, isRetrying: false, countdownMs: 0 } : prev,
          );
        }, detail.delayMs + 50);
      }
    };

    const onCircuitOpen = () => refreshCircuit();
    const onQueueUpdated = () =>
      setStatus((prev) => ({
        ...prev,
        queuedWriteCount: loadFailedWriteQueue().length,
      }));

    window.addEventListener(CONTRACT_RETRY_EVENT, onRetry);
    window.addEventListener(CIRCUIT_OPEN_EVENT, onCircuitOpen);
    window.addEventListener(FAILED_WRITE_QUEUE_EVENT, onQueueUpdated);

    const circuitTimer = setInterval(refreshCircuit, 1000);

    return () => {
      window.removeEventListener(CONTRACT_RETRY_EVENT, onRetry);
      window.removeEventListener(CIRCUIT_OPEN_EVENT, onCircuitOpen);
      window.removeEventListener(FAILED_WRITE_QUEUE_EVENT, onQueueUpdated);
      clearInterval(circuitTimer);
      if (countdownTimer) clearInterval(countdownTimer);
      if (backoffTimer) clearTimeout(backoffTimer);
    };
  }, [refreshCircuit]);

  return status;
}
