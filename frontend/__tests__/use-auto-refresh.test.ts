import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoRefresh } from "@/lib/useAutoRefresh";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useAutoRefresh", () => {
  it("fetches data on mount when enabled", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ count: 42 });
    const { result } = renderHook(() => useAutoRefresh(fetchFn));

    await waitFor(() => expect(result.current.data).toEqual({ count: 42 }));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets loading=true while the request is in flight", async () => {
    let resolve!: (v: string) => void;
    const fetchFn = vi.fn().mockImplementation(
      () => new Promise<string>((r) => { resolve = r; }),
    );

    const { result } = renderHook(() => useAutoRefresh(fetchFn));
    expect(result.current.loading).toBe(true);

    await act(async () => { resolve("done"); });
    expect(result.current.loading).toBe(false);
  });

  it("captures error messages on failure", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useAutoRefresh(fetchFn));

    await waitFor(() => expect(result.current.error).toBe("network error"));
    expect(result.current.data).toBeNull();
  });

  it("polls again after the configured interval", async () => {
    const fetchFn = vi.fn().mockResolvedValue(1);
    renderHook(() => useAutoRefresh(fetchFn, { interval: 5_000 }));

    await act(async () => { await Promise.resolve(); });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not fetch at all when disabled", async () => {
    const fetchFn = vi.fn().mockResolvedValue(1);
    renderHook(() => useAutoRefresh(fetchFn, { enabled: false }));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sets lastRefreshed after a successful fetch", async () => {
    const fetchFn = vi.fn().mockResolvedValue("ok");
    const { result } = renderHook(() => useAutoRefresh(fetchFn));

    await waitFor(() => expect(result.current.lastRefreshed).not.toBeNull());
    expect(result.current.lastRefreshed).toBeInstanceOf(Date);
  });

  it("skips polling while the tab is hidden", async () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });

    const fetchFn = vi.fn().mockResolvedValue(1);
    renderHook(() =>
      useAutoRefresh(fetchFn, { interval: 5_000, pauseWhenHidden: true }),
    );

    // Initial fetch runs before the first interval
    await act(async () => { await Promise.resolve(); });
    const callsAfterMount = fetchFn.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    // Interval ticks should have been skipped while hidden
    expect(fetchFn.mock.calls.length).toBe(callsAfterMount);

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("exposes a manual refresh() that works even when disabled", async () => {
    const fetchFn = vi.fn().mockResolvedValue("manual");
    const { result } = renderHook(() =>
      useAutoRefresh(fetchFn, { enabled: false }),
    );

    expect(fetchFn).not.toHaveBeenCalled();

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.data).toBe("manual"));
  });

  it("does not make concurrent requests for overlapping intervals", async () => {
    let resolvePending!: (v: number) => void;
    const fetchFn = vi.fn().mockImplementation(
      () => new Promise<number>((r) => { resolvePending = r; }),
    );

    renderHook(() => useAutoRefresh(fetchFn, { interval: 1_000 }));
    // First fetch in flight; trigger another interval tick
    await act(async () => { vi.advanceTimersByTime(1_000); await Promise.resolve(); });

    // Second tick should NOT start a second fetch while the first is in flight
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await act(async () => { resolvePending(99); await Promise.resolve(); });
  });
});
