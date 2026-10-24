import { describe, expect, it } from "vitest";
import { StrKey } from "@stellar/stellar-sdk";
import { validateTokenAddress } from "@/lib/sanitize";

const VALID_CONTRACT_ADDRESS = StrKey.encodeContract(new Uint8Array(32).fill(7));
const VALID_ACCOUNT_ADDRESS = StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(7));

describe("validateTokenAddress (BUG-45)", () => {
  it("accepts a valid C-prefixed Soroban contract StrKey and trims whitespace", () => {
    expect(validateTokenAddress(VALID_CONTRACT_ADDRESS)).toBeNull();
    expect(validateTokenAddress(`  ${VALID_CONTRACT_ADDRESS.toLowerCase()} \n`)).toBeNull();
  });

  it("rejects a valid G-prefixed Stellar account StrKey with C... error text", () => {
    expect(validateTokenAddress(VALID_ACCOUNT_ADDRESS)).toBe(
      "Token address must be a valid Stellar contract address (C...).",
    );
  });

  it("rejects a C-prefixed contract address with an invalid checksum", () => {
    const lastChar = VALID_CONTRACT_ADDRESS.slice(-1);
    const replacement = lastChar === "A" ? "B" : "A";
    const badChecksum = `${VALID_CONTRACT_ADDRESS.slice(0, -1)}${replacement}`;
    expect(validateTokenAddress(badChecksum)).toBe(
      "Token address must be a valid Stellar contract address (C...).",
    );
  });

  it("rejects wrong-length or empty input", () => {
    expect(validateTokenAddress("")).toBe(
      "Token address must be a valid Stellar contract address (C...).",
    );
    expect(validateTokenAddress("   ")).toBe(
      "Token address must be a valid Stellar contract address (C...).",
    );
    expect(validateTokenAddress(VALID_CONTRACT_ADDRESS.slice(0, 55))).toBe(
      "Token address must be a valid Stellar contract address (C...).",
    );
    expect(validateTokenAddress(`${VALID_CONTRACT_ADDRESS}A`)).toBe(
      "Token address must be a valid Stellar contract address (C...).",
    );
  });
});
