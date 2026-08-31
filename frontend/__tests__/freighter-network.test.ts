import { describe, expect, it } from "vitest";
import { normalizeFreighterNetwork } from "@/lib/stellar";

describe("normalizeFreighterNetwork", () => {
  it("maps Freighter network names to app network ids", () => {
    expect(normalizeFreighterNetwork("TESTNET")).toBe("testnet");
    expect(normalizeFreighterNetwork("FUTURENET")).toBe("futurenet");
    expect(normalizeFreighterNetwork("PUBLIC")).toBe("mainnet");
  });

  it("falls back to matching the network passphrase", () => {
    expect(
      normalizeFreighterNetwork(undefined, "Public Global Stellar Network ; September 2015"),
    ).toBe("mainnet");
    expect(
      normalizeFreighterNetwork(undefined, "Test SDF Network ; September 2015"),
    ).toBe("testnet");
  });

  it("returns null for unsupported custom networks", () => {
    expect(normalizeFreighterNetwork("STANDALONE")).toBeNull();
  });
});
