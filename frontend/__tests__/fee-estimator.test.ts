import { describe, it, expect } from "vitest";
import {
  computeFeeBreakdown,
  computeFeeRatio,
  computeRecentFeeComparison,
  formatFeeUsd,
  getHighFeeWarning,
} from "@/lib/fee-estimator";

describe("computeFeeBreakdown", () => {
  it("splits the total into base + computation (resource) fee", () => {
    const breakdown = computeFeeBreakdown(100n, 1_190_000n);
    expect(breakdown.baseFeeStroops).toBe(100n);
    expect(breakdown.resourceFeeStroops).toBe(1_190_000n);
    expect(breakdown.totalFeeStroops).toBe(1_190_100n);
  });

  it("handles a zero computation fee (classic-only transaction)", () => {
    const breakdown = computeFeeBreakdown(200n, 0n);
    expect(breakdown).toEqual({
      baseFeeStroops: 200n,
      resourceFeeStroops: 0n,
      totalFeeStroops: 200n,
    });
  });

  it("clamps negative inputs to zero", () => {
    const breakdown = computeFeeBreakdown(-5n, -10n);
    expect(breakdown.baseFeeStroops).toBe(0n);
    expect(breakdown.resourceFeeStroops).toBe(0n);
    expect(breakdown.totalFeeStroops).toBe(0n);
  });
});

describe("computeRecentFeeComparison", () => {
  it("computes average and median for an odd number of fees", () => {
    const comparison = computeRecentFeeComparison([100n, 200n, 300n]);
    expect(comparison).not.toBeNull();
    expect(comparison!.count).toBe(3);
    expect(comparison!.averageFeeStroops).toBe(200n);
    expect(comparison!.medianFeeStroops).toBe(200n);
  });

  it("averages the two middle values for an even count", () => {
    const comparison = computeRecentFeeComparison([100n, 200n, 300n, 400n]);
    expect(comparison!.averageFeeStroops).toBe(250n);
    expect(comparison!.medianFeeStroops).toBe(250n);
  });

  it("sorts before computing the median", () => {
    const comparison = computeRecentFeeComparison([300n, 100n, 200n]);
    expect(comparison!.medianFeeStroops).toBe(200n);
  });

  it("accepts string and number fee inputs", () => {
    const comparison = computeRecentFeeComparison(["100", 200, "300"]);
    expect(comparison!.averageFeeStroops).toBe(200n);
    expect(comparison!.medianFeeStroops).toBe(200n);
  });

  it("ignores negative fees", () => {
    const comparison = computeRecentFeeComparison([-1n, 100n, 200n]);
    expect(comparison!.count).toBe(2);
    expect(comparison!.averageFeeStroops).toBe(150n);
  });

  it("returns null when there are no usable fees", () => {
    expect(computeRecentFeeComparison([])).toBeNull();
    expect(computeRecentFeeComparison([-5n])).toBeNull();
  });
});

describe("computeFeeRatio", () => {
  it("returns the estimate relative to the recent average", () => {
    const comparison = computeRecentFeeComparison([100n, 100n]);
    expect(computeFeeRatio(200n, comparison)).toBe(2);
    expect(computeFeeRatio(50n, comparison)).toBe(0.5);
  });

  it("returns null when there is nothing to compare with", () => {
    expect(computeFeeRatio(200n, null)).toBeNull();
    expect(computeFeeRatio(200n, computeRecentFeeComparison([0n]))).toBeNull();
  });
});

describe("getHighFeeWarning", () => {
  it("warns when the estimate exceeds the ratio threshold vs the average", () => {
    const comparison = computeRecentFeeComparison([100n, 100n]);
    const warning = getHighFeeWarning(400n, comparison);
    expect(warning).toContain("300% higher");
    expect(warning).toContain("0.0000100 XLM");
    expect(warning).toContain("across 2 transactions");
  });

  it("uses the singular label for a single comparison transaction", () => {
    const comparison = computeRecentFeeComparison([100n]);
    const warning = getHighFeeWarning(300n, comparison);
    expect(warning).toContain("across 1 transaction");
  });

  it("returns null when the estimate is within the threshold", () => {
    const comparison = computeRecentFeeComparison([100n, 100n]);
    expect(getHighFeeWarning(150n, comparison)).toBeNull();
  });

  it("falls back to an absolute threshold when there is no fee history", () => {
    const warning = getHighFeeWarning(600_000n, null);
    expect(warning).toContain("unusually high");
    expect(getHighFeeWarning(100_000n, null)).toBeNull();
  });

  it("respects a custom ratio threshold", () => {
    const comparison = computeRecentFeeComparison([100n]);
    expect(getHighFeeWarning(150n, comparison, 3)).toBeNull();
    expect(getHighFeeWarning(400n, comparison, 3)).toContain("higher");
  });
});

describe("formatFeeUsd", () => {
  const rates = { USD: 0.31, JPY: 46.2 } as const;

  it("formats fees above one unit with two decimals", () => {
    const fee = formatFeeUsd(4_000_000_000n, "USD", rates);
    expect(fee).toMatch(/^\$/);
    expect(fee).toContain("124");
  });

  it("uses extra decimal places for very small fees", () => {
    const fee = formatFeeUsd(12_900n, "USD", rates);
    expect(fee).toMatch(/^\$/);
    expect(fee).toContain("0.0004");
  });

  it("formats JPY with no decimal places", () => {
    const fee = formatFeeUsd(1_000_000_000n, "JPY", rates);
    expect(fee).toMatch(/[¥JPY]/);
    expect(fee).not.toContain(".");
  });

  it("returns null when the rate is missing or invalid", () => {
    expect(formatFeeUsd(100n, "USD", null)).toBeNull();
    expect(formatFeeUsd(100n, "USD", {})).toBeNull();
    expect(formatFeeUsd(100n, "USD", { USD: 0 })).toBeNull();
    expect(formatFeeUsd(100n, "USD", { USD: -1 })).toBeNull();
    expect(formatFeeUsd(100n, "USD", { USD: Number.NaN })).toBeNull();
  });
});
