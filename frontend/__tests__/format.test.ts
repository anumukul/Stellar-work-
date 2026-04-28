import { describe, expect, it } from "vitest";
import { toXlm } from "@/lib/format";

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
});
