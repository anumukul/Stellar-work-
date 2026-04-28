import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../lib/stellar", () => ({
  callContract: vi.fn(),
  nativeToScVal: vi.fn((value: unknown) => value),
}));

import { hexToBytes, requireContractId } from "../lib/contract";

describe("lib/contract helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hexToBytes converts a valid hex string", () => {
    expect(Array.from(hexToBytes("0x0a10ff"))).toEqual([10, 16, 255]);
    expect(Array.from(hexToBytes("0A10FF"))).toEqual([10, 16, 255]);
  });

  it("hexToBytes throws for odd-length hex strings", () => {
    expect(() => hexToBytes("abc")).toThrow("Invalid hex input.");
  });

  it("hexToBytes throws for non-hex characters", () => {
    expect(() => hexToBytes("zz")).toThrow("Invalid hex input.");
    expect(() => hexToBytes("0x12gh")).toThrow("Invalid hex input.");
  });

  it("requireContractId returns env contract id when set", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", "CA12345");
    expect(requireContractId()).toBe("CA12345");
  });

  it("requireContractId throws when env contract id is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", "");
    expect(() => requireContractId()).toThrow(
      "NEXT_PUBLIC_CONTRACT_ID is not configured.",
    );
  });
});
