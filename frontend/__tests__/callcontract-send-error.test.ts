import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Shared spy state (mirrors callcontract-simulation.test.ts pattern) ────────
const simulateTransaction = vi.fn();
const sendTransaction = vi.fn();
const prepareTransaction = vi.fn();
const getAccount = vi.fn();
const getTransaction = vi.fn();
const assembleTransactionBuild = vi.fn();
const isSimulationError = vi.fn();
const isSimulationSuccess = vi.fn();
const signTransactionSpy = vi.fn();

const isAllowedMock = vi.fn();
const getAddressMock = vi.fn();

vi.mock("@stellar/stellar-sdk", () => {
  class _Account {
    constructor(public id: string, public sequence: string) {}
    accountId() { return this.id; }
    incrementSequenceNumber() { void 0; }
    sequenceNumber() { return this.sequence; }
  }
  class _Contract {
    constructor(public contractId: string) {}
    call(method: string, ...args: unknown[]) { return { __op: "call", method, args }; }
  }
  class _TransactionBuilder {
    private operations: unknown[] = [];
    constructor(public source: unknown, public opts: unknown) {}
    addOperation(op: unknown) { this.operations.push(op); return this; }
    setTimeout() { return this; }
    build() { return { __tx: true, source: this.source, operations: this.operations }; }
    static fromXDR(xdrValue: string) {
      // Return a realistic signed transaction so Transaction verification
      // (Issue #855) passes before the tx reaches sendTransaction.
      return {
        __tx: true,
        fromXdr: xdrValue,
        source: "GWALLET",
        fee: "100",
        operations: [{ type: "invokeHostFunction" }],
        timeBounds: null,
        hash: () => ({ toString: () => "deadbeef" }),
      };
    }
  }
  return {
    Account: _Account,
    BASE_FEE: "100",
    Contract: _Contract,
    Keypair: { random: () => ({ publicKey: () => "GANY" }) },
    Networks: { PUBLIC: "Public", TESTNET: "Test SDF Network ; September 2015" },
    nativeToScVal: (value: unknown) => ({ __scval: value }),
    rpc: {
      Server: vi.fn().mockImplementation(() => ({
        getAccount,
        simulateTransaction,
        sendTransaction,
        prepareTransaction,
        getTransaction,
      })),
      Api: {
        isSimulationError: (sim: unknown) => isSimulationError(sim),
        isSimulationSuccess: (sim: unknown) => isSimulationSuccess(sim),
        SendTransactionStatus: { ERROR: "ERROR", PENDING: "PENDING", SUCCESS: "SUCCESS" },
        GetTransactionStatus: { SUCCESS: "SUCCESS", FAILED: "FAILED" },
      },
      assembleTransaction: vi.fn(() => ({ build: assembleTransactionBuild })),
    },
    scValToNative: (value: unknown) => value,
    TransactionBuilder: _TransactionBuilder,
    xdr: {},
  };
});

vi.mock("@stellar/freighter-api", () => ({
  getAddress: (...args: unknown[]) => getAddressMock(...args),
  isAllowed: (...args: unknown[]) => isAllowedMock(...args),
  requestAccess: vi.fn(),
  signTransaction: (...args: unknown[]) => signTransactionSpy(...args),
}));

import { callContract } from "../lib/stellar";

describe("callContract sendTransaction error path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Wallet connected
    isAllowedMock.mockResolvedValue({ isAllowed: true });
    getAddressMock.mockResolvedValue({ address: "GWALLET", error: undefined });
    getAccount.mockResolvedValue({
      id: "GWALLET",
      accountId: () => "GWALLET",
      incrementSequenceNumber: () => { void 0; },
      sequenceNumber: () => "0",
    });
    // Simulation succeeds so we reach the send step
    isSimulationError.mockReturnValue(false);
    isSimulationSuccess.mockReturnValue(true);
    simulateTransaction.mockResolvedValue({ result: { retval: {} } });
    assembleTransactionBuild.mockReturnValue({ toXDR: () => "ASSEMBLED_XDR" });
    prepareTransaction.mockResolvedValue({
      toXDR: () => "PREPARED_XDR",
      source: "GWALLET",
      fee: "100",
      operations: [{ type: "invokeHostFunction" }],
      timeBounds: null,
    });
    signTransactionSpy.mockResolvedValue({ signedTxXdr: "SIGNED_XDR" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when sendTransaction returns ERROR status", async () => {
    sendTransaction.mockResolvedValue({
      status: "ERROR",
      errorResult: { toXDR: () => ({ toString: () => "ledger error" }) },
    });

    await expect(
      callContract("CCONTRACT", "post_job", []),
    ).rejects.toThrow();

    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("resets to a non-pending state after sendTransaction ERROR", async () => {
    sendTransaction.mockResolvedValue({
      status: "ERROR",
      errorResult: { toXDR: () => ({ toString: () => "err" }) },
    });

    let threw = false;
    try {
      await callContract("CCONTRACT", "post_job", []);
    } catch {
      threw = true;
    }

    // The call must have thrown (not hung in a pending loop)
    expect(threw).toBe(true);
    // sendTransaction called once — no polling loop entered
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("returns ERROR result when the polled transaction status is FAILED", async () => {
    sendTransaction.mockResolvedValue({
      status: "PENDING",
      hash: "TX_HASH_FAIL",
    });

    getTransaction.mockResolvedValue({ status: "FAILED" });

    const result = await callContract("CCONTRACT", "post_job", [], {
      pollTimeout: 500,
    });

    expect(result.status).toBe("ERROR");
    expect(result.hash).toBe("TX_HASH_FAIL");
  });

  it("decodes the contract return value after transaction confirmation", async () => {
    sendTransaction.mockResolvedValue({ status: "PENDING", hash: "TX_HASH_OK" });
    getTransaction.mockResolvedValue({ status: "SUCCESS", returnValue: 17n });

    const result = await callContract("CCONTRACT", "post_job", [], {
      pollTimeout: 500,
    });

    expect(result).toEqual({ status: "SUCCESS", hash: "TX_HASH_OK", data: 17n });
  });
  it("does not call signTransaction when simulation itself errors", async () => {
    isSimulationError.mockReturnValue(true);
    simulateTransaction.mockResolvedValue({ error: "sim failed" });

    await expect(
      callContract("CCONTRACT", "post_job", []),
    ).rejects.toThrow("sim failed");

    expect(signTransactionSpy).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
