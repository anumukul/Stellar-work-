import { describe, it, expect } from "vitest";

import { truncateAddress, getNetwork, getExplorerTxUrl } from "../lib/stellar";

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

describe("getExplorerTxUrl", () => {
  it("returns testnet URL by default", () => {
    const url = getExplorerTxUrl("abctxhash");
    expect(url).toContain("testnet");
    expect(url).toContain("abctxhash");
  });
});
