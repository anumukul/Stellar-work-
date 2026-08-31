import { describe, expect, it } from "vitest";
import { formatFiatAmount, formatXlmWithFiat, toXlm } from "@/lib/format";

describe("toXlm", () => {
  it("formats common stroop amounts", () => {
    expect(toXlm("10000000")).toBe("1.00");
    expect(toXlm(25000000)).toBe("2.50");
    expect(toXlm(BigInt(123456789))).toBe("12.35");
  });

  it("covers edge values", () => {
    expect(toXlm(0)).toBe("0.00");
    expect(toXlm("1")).toBe("0.00");
    expect(toXlm(-10000000)).toBe("-1.00");
  });

  it("applies rounding to 2 decimals", () => {
    expect(toXlm(10050000)).toBe("1.01");
    expect(toXlm(10049999)).toBe("1.00");
  });

  it("formats very large amounts without scientific notation", () => {
    const formatted = toXlm("1000000000000000000000");
    expect(/[eE][+-]?\d+/.test(formatted)).toBe(false);
    expect(/\d{2}$/.test(formatted)).toBe(true);
  });

  it("adds locale-aware group separators for large values", () => {
    const formatted = toXlm("100001234500");
    const expected = `${new Intl.NumberFormat(undefined, {
      useGrouping: true,
      maximumFractionDigits: 0,
    }).format(10000)}.12`;

    expect(formatted).toBe(expected);
  });
});

describe("formatXlmWithFiat", () => {
  it("shows the selected fiat value next to XLM", () => {
    const formatted = formatXlmWithFiat(50_000_000, "USD", { USD: 0.12 });

    expect(formatted).toContain("5.00 XLM");
    expect(formatted).toContain("0.60");
    expect(formatted).toContain("USD");
  });

  it("falls back to XLM only when a rate is unavailable", () => {
    expect(formatXlmWithFiat(50_000_000, "EUR", { USD: 0.12 })).toBe("5.00 XLM");
  });

  it("formats zero-decimal currencies", () => {
    expect(formatFiatAmount(125.4, "JPY")).toContain("125");
  });
});