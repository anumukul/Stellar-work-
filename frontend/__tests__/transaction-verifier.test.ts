import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Stellar SDK mock ─────────────────────────────────────────────────────────
// The verifier parses the signed XDR via TransactionBuilder.fromXDR and then
// inspects structural fields (source, operations, fee, timebounds) and the
// transaction hash. We stub those reads so the tests exercise the verifier's
// comparison logic without needing real XDR blobs.
let mockParseResult: {
  source: string;
  fee: string;
  operations: Array<{ type: string }>;
  timeBounds?: { minTime: string; maxTime: string } | null;
  hash: () => { toString: () => string };
} | null = null;
let mockParseThrows = false;

vi.mock("@stellar/stellar-sdk", () => ({
  TransactionBuilder: {
    fromXDR: vi.fn(() => {
      if (mockParseThrows) {
        throw new Error("Bad union switch");
      }
      if (!mockParseResult) {
        throw new Error("Unexpected parse in test");
      }
      return mockParseResult;
    }),
  },
  Networks: {
    PUBLIC: "Public Global Stellar Network ; September 2015",
    TESTNET: "Test SDF Network ; September 2015",
  },
}));

import { TransactionVerifier } from "../lib/transaction-verifier";
import type { TransactionIntent } from "../lib/transaction-verifier";

function validIntent(overrides: Partial<TransactionIntent> = {}): TransactionIntent {
  return {
    sourceAccount: "GSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    fee: "100",
    operationCount: 1,
    operationTypes: ["invokeHostFunction"],
    timebounds: { minTime: "0", maxTime: "1788172062" },
    ...overrides,
  };
}

function wrapParse(overrides: Partial<NonNullable<typeof mockParseResult>> = {}) {
  mockParseResult = {
    source: "GSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    fee: "100",
    operations: [{ type: "invokeHostFunction" }],
    timeBounds: { minTime: "0", maxTime: "1788172062" },
    hash: () => ({ toString: () => "abc123def456" }),
    ...overrides,
  };
}

describe("TransactionVerifier", () => {
  beforeEach(() => {
    mockParseResult = null;
    mockParseThrows = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockParseResult = null;
    mockParseThrows = false;
  });

  it("returns valid with no warnings/errors when the signed tx matches intent", () => {
    wrapParse();
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("SIGNED_XDR", validIntent());

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.details.sourceAccountMatch).toBe(true);
    expect(result.details.operationCount).toBe(1);
    expect(result.details.transactionHash).toBe("abc123def456");
  });

  it("blocks when the source account differs", () => {
    wrapParse({ source: "GATTACKERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" });
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("SIGNED_XDR", validIntent());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Source account mismatch"))).toBe(true);
    expect(result.details.sourceAccountMatch).toBe(false);
  });

  it("blocks when the operation count differs", () => {
    wrapParse({
      operations: [
        { type: "invokeHostFunction" },
        { type: "invokeHostFunction" },
      ],
    });
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("SIGNED_XDR", validIntent());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Operation count mismatch"))).toBe(true);
  });

  it("blocks when an operation type differs", () => {
    wrapParse({ operations: [{ type: "payment" }] });
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("SIGNED_XDR", validIntent());

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) =>
          e.includes("Operation type mismatch") &&
          e.includes("expected invokeHostFunction") &&
          e.includes("got payment"),
      ),
    ).toBe(true);
  });

  it("flags unexpected extra operations as errors", () => {
    wrapParse({
      operations: [
        { type: "invokeHostFunction" },
        { type: "invokeHostFunction" },
      ],
    });
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("SIGNED_XDR", validIntent());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unexpected operation"))).toBe(true);
  });

  it("warns (but does not block) when the fee is significantly higher", () => {
    wrapParse({ fee: "200" });
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("SIGNED_XDR", validIntent());

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("Fee higher than expected"))).toBe(true);
    expect(result.details.feeWithinTolerance).toBe(false);
  });

  it("does not warn when the fee is equal", () => {
    wrapParse({ fee: "100" });
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("SIGNED_XDR", validIntent());

    expect(result.warnings).toHaveLength(0);
    expect(result.details.feeWithinTolerance).toBe(true);
  });

  it("does not warn for a small fee bump within tolerance", () => {
    wrapParse({ fee: "101" });
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("SIGNED_XDR", validIntent());

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns when timebounds mismatch but does not block", () => {
    wrapParse({ timeBounds: { minTime: "5", maxTime: "1788172062" } });
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("SIGNED_XDR", validIntent());

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("Timebounds mismatch"))).toBe(true);
    expect(result.details.timeboundsMatch).toBe(false);
  });

  it("warns when timebounds are missing entirely but does not block", () => {
    wrapParse({ timeBounds: null });
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("SIGNED_XDR", validIntent());

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("Timebounds mismatch"))).toBe(true);
  });

  it("marks timebounds as not checked when intent has none", () => {
    wrapParse({ timeBounds: { minTime: "0", maxTime: "1788172062" } });
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("SIGNED_XDR", validIntent({ timebounds: null }));

    expect(result.valid).toBe(true);
    expect(result.details.timeboundsMatch).toBeNull();
    expect(result.warnings.some((w) => w.includes("Timebounds"))).toBe(false);
  });

  it("blocks with a parse error on malformed XDR", () => {
    mockParseThrows = true;
    const verifier = new TransactionVerifier("Test SDF Network ; September 2015");
    const result = verifier.verify("NOT_REAL_XDR", validIntent());

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Failed to parse signed transaction"))).toBe(true);
    expect(result.details.operationCount).toBe(0);
  });
});
