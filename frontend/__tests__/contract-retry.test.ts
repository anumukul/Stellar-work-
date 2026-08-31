import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RETRY_CONFIG,
  isRetryableNetworkError,
  resetCircuitBreaker,
  resetRetryConfig,
  withContractRetry,
} from "../lib/contract-retry";

describe("contract-retry", () => {
  beforeEach(() => {
    localStorage.clear();
    resetRetryConfig();
    resetCircuitBreaker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("identifies transient network errors as retryable", () => {
    expect(isRetryableNetworkError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableNetworkError(new Error("429 Too Many Requests"))).toBe(true);
    expect(isRetryableNetworkError(new Error("user rejected transaction"))).toBe(false);
  });

  it("retries with exponential backoff then succeeds", async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce("ok");

    const promise = withContractRetry(operation, "test-op", { readOnly: true });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not retry non-network errors", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("user rejected"));

    await expect(withContractRetry(operation, "test-op", { readOnly: true })).rejects.toThrow(
      "user rejected",
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("opens circuit breaker after repeated exhausted retries", async () => {
    saveRetryConfigForTest({ circuitBreakerThreshold: 2, maxRetries: 1 });

    const operation = vi.fn().mockRejectedValue(new Error("network error"));

    await expect(withContractRetry(operation, "op-a", { readOnly: true })).rejects.toThrow();
    await expect(withContractRetry(operation, "op-b", { readOnly: true })).rejects.toThrow();

    await expect(withContractRetry(operation, "op-c", { readOnly: true })).rejects.toThrow(
      /circuit breaker/i,
    );
  });
});

function saveRetryConfigForTest(
  patch: Partial<typeof DEFAULT_RETRY_CONFIG>,
): void {
  localStorage.setItem(
    "stellarwork:contract-retry-config",
    JSON.stringify({ ...DEFAULT_RETRY_CONFIG, ...patch }),
  );
}
