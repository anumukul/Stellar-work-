import { describe, it, expect } from "vitest";

import {
  truncateAddress,
  getNetwork,
  getExplorerTxUrl,
  isValidStellarAddress,
} from "../lib/stellar";

describe("truncateAddress", () => {
  it("truncates a Stellar address with default 4 chars", () => {
    const addr = "GALVPSP4DOAQTNBPRYMHFJNRXFJPCJQQGFPRP5DBQKXGYGDHMHXBVHGF";
    expect(truncateAddress(addr)).toBe("GALVPS...VHGF");
  });

  it("truncates with custom char count", () => {
    const addr = "GALVPSP4DOAQTNBPRYMHFJNRXFJPCJQQGFPRP5DBQKXGYGDHMHXBVHGF";
    expect(truncateAddress(addr, 6)).toBe("GALVPSP4...XBVHGF");
  });

  it("returns short addresses unchanged", () => {
    expect(truncateAddress("abc")).toBe("abc");
    expect(truncateAddress("GA")).toBe("GA");
    expect(truncateAddress("GABCDEFGHIJK")).toBe("GABCDE...HIJK");
  });

  it("returns empty string for empty input", () => {
    expect(truncateAddress("")).toBe("");
  });
});

describe("isValidStellarAddress", () => {
  it("accepts a 56-character G account address", () => {
    expect(
      isValidStellarAddress(
        "GABC7DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV",
      ),
    ).toBe(true);
  });

  it("accepts a 56-character C contract address", () => {
    expect(
      isValidStellarAddress(
        "CABC7DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV",
      ),
    ).toBe(true);
  });

  it("rejects short, padded, or invalid-alphabet strings", () => {
    expect(isValidStellarAddress("GNATIVE")).toBe(false);
    expect(isValidStellarAddress("not-an-address")).toBe(false);
    expect(
      isValidStellarAddress(
        "GTOKEN000000000000000000000000000000000000000000000000000",
      ),
    ).toBe(false);
    expect(isValidStellarAddress("")).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(
      isValidStellarAddress(
        "  GABC7DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV  ",
      ),
    ).toBe(true);
  });
});

describe("getExplorerTxUrl", () => {
  it("returns testnet URL by default", () => {
    const url = getExplorerTxUrl("abctxhash");
    expect(url).toContain("testnet");
    expect(url).toContain("abctxhash");
  });
});
