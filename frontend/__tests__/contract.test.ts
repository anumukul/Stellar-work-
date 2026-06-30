import { describe, it, expect, vi } from "vitest";

const mockCallContract = vi.fn();

vi.mock("../lib/stellar", async () => {
  const actual = await vi.importActual("../lib/stellar");
  return {
    ...actual,
    callContract: (...args: unknown[]) => mockCallContract(...args),
    nativeToScVal: (value: unknown) => value,
  };
});

import {
  hexToBytes,
  requireContractId,
  postJob,
  getJob,
  getJobCount,
  getCompletedJobsCount,
  getFees,
  acceptJob,
  submitWork,
  approveWork,
  cancelJob,
  getNativeToken,
  isTokenAllowed,
  getDescriptionCid,
  storeDescriptionCid,
} from "../lib/contract";
import { truncateAddress } from "../lib/stellar";

const CONTRACT_ID_ERROR = "NEXT_PUBLIC_CONTRACT_ID is not configured.";

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
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", "CA12345");
    expect(requireContractId()).toBe("CA12345");
  });

  it("throws when the contract id env var is empty", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", "");
    expect(() => requireContractId()).toThrow(CONTRACT_ID_ERROR);
  });

  it("throws when the contract id env var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", undefined);
    expect(() => requireContractId()).toThrow(CONTRACT_ID_ERROR);
  });
});

describe("truncateAddress", () => {
  it("truncates a Stellar address", () => {
    const addr = "GALVPSP4DOAQTNBPRYMHFJNRXFJPCJQQGFPRP5DBQKXGYGDHMHXBVHGF";
    expect(truncateAddress(addr)).toBe("GALVPS...VHGF");
  });
});

describe("contract calls with config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", "CCONTRACT123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("postJob calls contract with correct args", async () => {
    mockCallContract.mockResolvedValue({ status: "SUCCESS" });
    await postJob("GCLIENT", "100", "0a10ff", 32, "12345", "GTOKEN");
    expect(mockCallContract).toHaveBeenCalledTimes(1);
  });

  it("getJob calls contract in readOnly mode", async () => {
    mockCallContract.mockResolvedValue({ status: "SUCCESS", data: null });
    await getJob("1");
    expect(mockCallContract).toHaveBeenCalledTimes(1);
    const callArgs = mockCallContract.mock.calls[0];
    expect(callArgs[3]).toEqual({ readOnly: true });
  });

  it("getJobCount calls contract in readOnly mode", async () => {
    mockCallContract.mockResolvedValue({ status: "SUCCESS", data: 5 });
    const result = await getJobCount();
    expect(result).toBe(5);
  });

  it("getCompletedJobsCount returns 0 when data is null", async () => {
    mockCallContract.mockResolvedValue({ status: "SUCCESS", data: null });
    const result = await getCompletedJobsCount();
    expect(result).toBe(0);
  });

  it("getFees returns number from contract", async () => {
    mockCallContract.mockResolvedValue({ status: "SUCCESS", data: 25000 });
    const result = await getFees("GTOKEN");
    expect(result).toBe(25000);
  });

  it("getNativeToken returns string from contract", async () => {
    mockCallContract.mockResolvedValue({ status: "SUCCESS", data: "GTOKEN" });
    const result = await getNativeToken();
    expect(result).toBe("GTOKEN");
  });

  it("isTokenAllowed returns boolean from contract", async () => {
    mockCallContract.mockResolvedValue({ status: "SUCCESS", data: true });
    const result = await isTokenAllowed("GTOKEN");
    expect(result).toBe(true);
  });

  it("isTokenAllowed returns false when data is falsy", async () => {
    mockCallContract.mockResolvedValue({ status: "SUCCESS", data: false });
    const result = await isTokenAllowed("GTOKEN");
    expect(result).toBe(false);
  });

  it("getDescriptionCid returns string from contract", async () => {
    mockCallContract.mockResolvedValue({ status: "SUCCESS", data: "QmTest123" });
    const result = await getDescriptionCid("0a10ff");
    expect(result).toBe("QmTest123");
  });

  it("getDescriptionCid returns null when data is empty string", async () => {
    mockCallContract.mockResolvedValue({ status: "SUCCESS", data: "" });
    const result = await getDescriptionCid("0a10ff");
    expect(result).toBeNull();
  });
});

describe("contract calls without NEXT_PUBLIC_CONTRACT_ID", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_CONTRACT_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("postJob fails fast", async () => {
    await expect(
      postJob("GCLIENT", "100", "0x0a", 4, "0", "GTOKEN"),
    ).rejects.toThrow(CONTRACT_ID_ERROR);
  });

  it("getJob fails fast", async () => {
    await expect(getJob("1")).rejects.toThrow(CONTRACT_ID_ERROR);
  });

  it("acceptJob fails fast", async () => {
    await expect(acceptJob("GFREELANCER", "1")).rejects.toThrow(CONTRACT_ID_ERROR);
  });

  it("submitWork fails fast", async () => {
    await expect(submitWork("GFREELANCER", "1")).rejects.toThrow(CONTRACT_ID_ERROR);
  });

  it("approveWork fails fast", async () => {
    await expect(approveWork("GCLIENT", "1")).rejects.toThrow(CONTRACT_ID_ERROR);
  });

  it("cancelJob fails fast", async () => {
    await expect(cancelJob("GCLIENT", "1")).rejects.toThrow(CONTRACT_ID_ERROR);
  });

  it("storeDescriptionCid fails fast", async () => {
    await expect(
      storeDescriptionCid("GCLIENT", "0a10ff", "QmTest"),
    ).rejects.toThrow(CONTRACT_ID_ERROR);
  });
});
