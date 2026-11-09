import { describe, expect, it } from "vitest";
import { validateContractAddress, validateTokenAddress } from "@/lib/sanitize";

// Valid SEP-0023 StrKey contract ID (version byte 16 / 'C', 32-byte payload of 0x01, valid CRC16-XMODEM checksum)
const VALID_CONTRACT_ID = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";
// Valid SEP-0023 StrKey Ed25519 public key (version byte 48 / 'G', 32-byte payload of 0x01, valid CRC16-XMODEM checksum)
const VALID_ACCOUNT_ID = "GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H";
// C-prefixed 56-character string with corrupted CRC16-XMODEM checksum
const BAD_CHECKSUM_CONTRACT_ID = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC527";

describe("validateTokenAddress & validateContractAddress (BUG-45)", () => {
  it("accepts a valid C-prefixed Soroban contract StrKey and trims surrounding whitespace", () => {
    expect(validateTokenAddress(VALID_CONTRACT_ID)).toBeNull();
    expect(validateTokenAddress(`  ${VALID_CONTRACT_ID}\n\t `)).toBeNull();
    expect(validateTokenAddress(VALID_CONTRACT_ID.toLowerCase())).toBeNull();
    expect(validateContractAddress(`  ${VALID_CONTRACT_ID}  `)).toBe(VALID_CONTRACT_ID);
  });

  it("rejects a valid G-prefixed Stellar account address with C-prefix error message", () => {
    const err = validateTokenAddress(VALID_ACCOUNT_ID);
    expect(err).toBe("Token address must be a valid Stellar contract address (C...).");
    expect(validateContractAddress(VALID_ACCOUNT_ID)).toBeNull();
  });

  it("rejects a C-prefixed address with an invalid StrKey CRC16 checksum", () => {
    const err = validateTokenAddress(BAD_CHECKSUM_CONTRACT_ID);
    expect(err).toBe("Token address must be a valid Stellar contract address (C...).");
    expect(validateContractAddress(BAD_CHECKSUM_CONTRACT_ID)).toBeNull();
  });

  it("rejects wrong-length and empty inputs", () => {
    expect(validateTokenAddress("")).toBe(
      "Token address must be a valid Stellar contract address (C...).",
    );
    expect(validateTokenAddress("   ")).toBe(
      "Token address must be a valid Stellar contract address (C...).",
    );
    expect(validateTokenAddress(VALID_CONTRACT_ID.slice(0, 55))).toBe(
      "Token address must be a valid Stellar contract address (C...).",
    );
    expect(validateTokenAddress(`${VALID_CONTRACT_ID}A`)).toBe(
      "Token address must be a valid Stellar contract address (C...).",
    );
  });
});
