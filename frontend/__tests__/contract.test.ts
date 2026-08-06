import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCallContract = vi.fn();

vi.mock("../lib/stellar", async () => {
  const actual = (await vi.importActual("../lib/stellar")) as Record<string, unknown>;
  const actualXdr = actual.xdr as {
    ScVal: Record<string, unknown>;
    ScMapEntry: unknown;
  };
  return {
    ...actual,
    callContract: (...args: unknown[]) => mockCallContract(...args),
    nativeToScVal: (value: unknown) => value,
    xdr: {
      ...actualXdr,
      ScVal: {
        ...actualXdr.ScVal,
        scvVec: (items: unknown[]) => ({ __scvVec: items }),
        scvMap: (entries: unknown[]) => ({ __scvMap: entries }),
        scvSymbol: (value: string) => ({ __scvSymbol: value }),
      },
    },
  };
});

import {
  hexToBytes,
  requireContractId,
  postJob,
  acceptJob,
  submitWork,
  approveWork,
  cancelJob,
  enforceDeadline,
  extendJobTtl,
  raiseDispute,
  resolveDispute,
  withdrawFees,
  getFees,
  addAllowedToken,
  removeAllowedToken,
  isTokenAllowed,
  getNativeToken,
  getJob,
  getJobCount,
} from "../lib/contract";
import { truncateAddress } from "../lib/stellar";

const CONTRACT_ID = "CCONTRACT123";
const CONTRACT_ID_ERROR = "NEXT_PUBLIC_CONTRACT_ID is not configured.";
const CALL_ERROR = new Error("contract call failed");

function stubContractId(value: string | undefined) {
  vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", value);
  vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID_TESTNET", value);
  vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID_FUTURENET", undefined);
  vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID_MAINNET", undefined);
}

describe("hexToBytes", () => {
  it("parses valid hex strings to bytes", () => {
    expect(Array.from(hexToBytes("0a10ff"))).toEqual([10, 16, 255]);
    expect(Array.from(hexToBytes("0A10FF"))).toEqual([10, 16, 255]);
  });

  it("strips a 0x prefix before parsing", () => {
    expect(Array.from(hexToBytes("0x0a10ff"))).toEqual([10, 16, 255]);
  });

  it("throws for odd-length hex strings", () => {
    expect(() => hexToBytes("abc")).toThrow("Invalid hex input.");
  });

  it("throws for non-hex characters", () => {
    expect(() => hexToBytes("zz")).toThrow("Invalid hex input.");
  });

  it("handles empty hex string", () => {
    expect(Array.from(hexToBytes(""))).toEqual([]);
  });

  it("handles hex string with only 0x", () => {
    expect(Array.from(hexToBytes("0x"))).toEqual([]);
  });
});

describe("requireContractId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the configured contract id", () => {
    stubContractId("CA12345");
    expect(requireContractId()).toBe("CA12345");
  });

  it("throws when the contract id env var is empty", () => {
    stubContractId("");
    expect(() => requireContractId()).toThrow(CONTRACT_ID_ERROR);
  });

  it("throws when the contract id env var is unset", () => {
    stubContractId(undefined);
    expect(() => requireContractId()).toThrow(CONTRACT_ID_ERROR);
  });
});

describe("truncateAddress", () => {
  it("truncates a Stellar address", () => {
    const addr = "GALVPSP4DOAQTNBPRYMHFJNRXFJPCJQQGFPRP5DBQKXGYGDHMHXBVHGF";
    expect(truncateAddress(addr)).toBe("GALVPS...VHGF");
  });
});

describe("contract interaction wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubContractId(CONTRACT_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("success paths", () => {
    it("postJob calls post_job", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      const result = await postJob("GCLIENT", "100", "0a10ff", 32, "12345", "GTOKEN", "", "development");
      expect(result).toEqual({ status: "SUCCESS" });
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "post_job",
        expect.any(Array),
      );
    });

    it("acceptJob calls accept_job", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      await acceptJob("GFREELANCER", "1");
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "accept_job",
        expect.any(Array),
      );
    });

    it("submitWork calls submit_work", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      await submitWork("GFREELANCER", "1");
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "submit_work",
        expect.any(Array),
      );
    });

    it("approveWork calls approve_work", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      await approveWork("GCLIENT", "1");
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "approve_work",
        expect.any(Array),
      );
    });

    it("cancelJob calls cancel_job", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      await cancelJob("GCLIENT", "1");
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "cancel_job",
        expect.any(Array),
      );
    });

    it("enforceDeadline calls enforce_deadline", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      await enforceDeadline("GCLIENT", "1");
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "enforce_deadline",
        expect.any(Array),
      );
    });

    it("extendJobTtl calls extend_job_ttl", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      await extendJobTtl("GCLIENT", "1");
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "extend_job_ttl",
        expect.any(Array),
      );
    });

    it("raiseDispute calls raise_dispute", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      await raiseDispute("GCLIENT", "1");
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "raise_dispute",
        expect.any(Array),
      );
    });

    it("resolveDispute calls resolve_dispute", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      await resolveDispute("1", 5000);
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "resolve_dispute",
        expect.any(Array),
      );
    });

    it("withdrawFees calls withdraw_fees", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      await withdrawFees("GTOKEN");
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "withdraw_fees",
        expect.any(Array),
      );
    });

    it("getFees returns number from contract", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS", data: 25000 });
      await expect(getFees("GTOKEN")).resolves.toBe(25000);
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "get_fees",
        expect.any(Array),
        { readOnly: true },
      );
    });

    it("getFees returns 0 when data is null", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS", data: null });
      await expect(getFees("GTOKEN")).resolves.toBe(0);
    });

    it("addAllowedToken calls add_allowed_token", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      await addAllowedToken("GTOKEN");
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "add_allowed_token",
        expect.any(Array),
      );
    });

    it("removeAllowedToken calls remove_allowed_token", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS" });
      await removeAllowedToken("GTOKEN");
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "remove_allowed_token",
        expect.any(Array),
      );
    });

    it("isTokenAllowed returns boolean from contract", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS", data: true });
      await expect(isTokenAllowed("GTOKEN")).resolves.toBe(true);
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "is_token_allowed",
        expect.any(Array),
        { readOnly: true },
      );
    });

    it("isTokenAllowed returns false when data is falsy", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS", data: false });
      await expect(isTokenAllowed("GTOKEN")).resolves.toBe(false);
    });

    it("getNativeToken returns string from contract", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS", data: "GTOKEN" });
      await expect(getNativeToken()).resolves.toBe("GTOKEN");
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "get_native_token",
        [],
        { readOnly: true },
      );
    });

    it("getJob returns job data and uses readOnly mode", async () => {
      const job = { id: "1", amount: "100" };
      mockCallContract.mockResolvedValue({ status: "SUCCESS", data: job });
      await expect(getJob("1")).resolves.toEqual(job);
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "get_job",
        expect.any(Array),
        { readOnly: true },
      );
    });

    it("getJob returns null when data is missing", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS", data: null });
      await expect(getJob("1")).resolves.toBeNull();
    });

    it("getJobCount returns number from contract", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS", data: 5 });
      await expect(getJobCount()).resolves.toBe(5);
      expect(mockCallContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        "get_job_count",
        [],
        { readOnly: true },
      );
    });

    it("getJobCount returns 0 when data is null", async () => {
      mockCallContract.mockResolvedValue({ status: "SUCCESS", data: null });
      await expect(getJobCount()).resolves.toBe(0);
    });
  });

  describe("error paths when callContract rejects", () => {
    beforeEach(() => {
      mockCallContract.mockRejectedValue(CALL_ERROR);
    });

    it.each([
      ["postJob", () => postJob("GCLIENT", "100", "0a10ff", 32, "12345", "GTOKEN", "", "development")],
      ["acceptJob", () => acceptJob("GFREELANCER", "1")],
      ["submitWork", () => submitWork("GFREELANCER", "1")],
      ["approveWork", () => approveWork("GCLIENT", "1")],
      ["cancelJob", () => cancelJob("GCLIENT", "1")],
      ["enforceDeadline", () => enforceDeadline("GCLIENT", "1")],
      ["extendJobTtl", () => extendJobTtl("GCLIENT", "1")],
      ["raiseDispute", () => raiseDispute("GCLIENT", "1")],
      ["resolveDispute", () => resolveDispute("1", 5000)],
      ["withdrawFees", () => withdrawFees("GTOKEN")],
      ["getFees", () => getFees("GTOKEN")],
      ["addAllowedToken", () => addAllowedToken("GTOKEN")],
      ["removeAllowedToken", () => removeAllowedToken("GTOKEN")],
      ["isTokenAllowed", () => isTokenAllowed("GTOKEN")],
      ["getNativeToken", () => getNativeToken()],
      ["getJob", () => getJob("1")],
      ["getJobCount", () => getJobCount()],
    ] as const)("%s propagates callContract errors", async (_name, invoke) => {
      await expect(invoke()).rejects.toThrow("contract call failed");
    });
  });
});

describe("contract calls without NEXT_PUBLIC_CONTRACT_ID", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubContractId("");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["postJob", () => postJob("GCLIENT", "100", "0x0a", 4, "0", "GTOKEN", "", "development")],
    ["acceptJob", () => acceptJob("GFREELANCER", "1")],
    ["submitWork", () => submitWork("GFREELANCER", "1")],
    ["approveWork", () => approveWork("GCLIENT", "1")],
    ["cancelJob", () => cancelJob("GCLIENT", "1")],
    ["enforceDeadline", () => enforceDeadline("GCLIENT", "1")],
    ["extendJobTtl", () => extendJobTtl("GCLIENT", "1")],
    ["raiseDispute", () => raiseDispute("GCLIENT", "1")],
    ["resolveDispute", () => resolveDispute("1", 5000)],
    ["withdrawFees", () => withdrawFees("GTOKEN")],
    ["getFees", () => getFees("GTOKEN")],
    ["addAllowedToken", () => addAllowedToken("GTOKEN")],
    ["removeAllowedToken", () => removeAllowedToken("GTOKEN")],
    ["isTokenAllowed", () => isTokenAllowed("GTOKEN")],
    ["getNativeToken", () => getNativeToken()],
    ["getJob", () => getJob("1")],
    ["getJobCount", () => getJobCount()],
  ] as const)("%s fails fast without contract id", async (_name, invoke) => {
    await expect(invoke()).rejects.toThrow(CONTRACT_ID_ERROR);
    expect(mockCallContract).not.toHaveBeenCalled();
  });
});
