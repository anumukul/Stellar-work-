import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallContract = vi.fn();

vi.mock("../lib/stellar", async () => {
  const actual = await vi.importActual("../lib/stellar");
  return {
    ...actual,
    callContract: (...args: unknown[]) => mockCallContract(...args),
    nativeToScVal: (value: unknown) => value,
  };
});

vi.mock("../lib/config", () => ({
  requireContractId: () => "CTEST_CONTRACT_ID",
}));

vi.mock("../lib/network-config", () => ({
  getContractIdForNetwork: () => "CTEST_CONTRACT_ID",
  getPersistedNetwork: () => "testnet",
}));

import { getJobVersion, migrateJobVersion } from "../lib/contract";
import type { Job } from "../lib/types";

// ─── SC-106: Job Versioning Tests ────────────────────────────────────────────

describe("getJobVersion", () => {
  beforeEach(() => {
    mockCallContract.mockReset();
  });

  it("calls get_job_version with correct u64 jobId and returns version number", async () => {
    mockCallContract.mockResolvedValue({ data: 1 });
    const result = await getJobVersion("42");
    expect(result).toBe(1);
    expect(mockCallContract).toHaveBeenCalledWith(
      "CTEST_CONTRACT_ID",
      "get_job_version",
      ["42"],
      { readOnly: true },
    );
  });

  it("defaults to 1 when response data is null", async () => {
    mockCallContract.mockResolvedValue({ data: null });
    const result = await getJobVersion("1");
    expect(result).toBe(1);
  });

  it("returns numeric version 2 when contract returns 2", async () => {
    mockCallContract.mockResolvedValue({ data: 2 });
    const result = await getJobVersion("5");
    expect(result).toBe(2);
  });
});

describe("migrateJobVersion", () => {
  beforeEach(() => {
    mockCallContract.mockReset();
  });

  it("calls migrate_job_version with correct arguments", async () => {
    mockCallContract.mockResolvedValue({ data: 2 });
    const result = await migrateJobVersion("ADDR_CALLER", "7", 2);
    expect(result).toBe(2);
    expect(mockCallContract).toHaveBeenCalledWith(
      "CTEST_CONTRACT_ID",
      "migrate_job_version",
      ["ADDR_CALLER", "7", 2],
    );
  });

  it("returns targetVersion as fallback when response data is null", async () => {
    mockCallContract.mockResolvedValue({ data: null });
    const result = await migrateJobVersion("ADDR_CALLER", "3", 5);
    expect(result).toBe(5);
  });
});

// ─── Job interface version field ──────────────────────────────────────────────

describe("Job interface version field", () => {
  it("accepts a Job object with version field set to 1", () => {
    const job: Job = {
      version: 1,
      client: "GABC",
      freelancer: null,
      amount: "1000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "0",
      deadline: "0",
      token: "CABC",
      revision_count: 0,
      submitted_at: "0",
    };
    expect(job.version).toBe(1);
  });

  it("allows version to be undefined for backwards compat with old jobs", () => {
    const job: Job = {
      client: "GABC",
      freelancer: null,
      amount: "1000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "0",
      deadline: "0",
      token: "CABC",
      revision_count: 0,
      submitted_at: "0",
    };
    expect(job.version).toBeUndefined();
  });

  it("supports higher schema versions for future migrations", () => {
    const job: Job = {
      version: 2,
      client: "GABC",
      freelancer: "GXYZ",
      amount: "5000000",
      description_hash: "def456",
      status: "InProgress",
      created_at: "1000",
      deadline: "2000",
      token: "CABC",
      revision_count: 1,
      submitted_at: "0",
    };
    expect(job.version).toBe(2);
    expect(job.status).toBe("InProgress");
  });
});
