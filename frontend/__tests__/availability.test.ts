import { describe, expect, it } from "vitest";
import {
  buildActiveFreelancerJobCountMap,
  countActiveJobsAsFreelancer,
  getEffectiveAvailability,
  emptyAvailability,
} from "../lib/availability";
import type { Job } from "../lib/types";

const baseJob = (overrides: Partial<Job> = {}): Job => ({
  version: 1,
  client: "GCLIENT",
  freelancer: null,
  amount: "1000000",
  description_hash: "abc",
  deadline: "0",
  token: "GTOKEN",
  status: "Open",
  created_at: "1",
  revision_count: 0,
  submitted_at: "0",
  title: "Test",
  category: "development",
  ...overrides,
});

describe("availability", () => {
  it("defaults to available preference with open offers off", () => {
    const empty = emptyAvailability();
    expect(empty.preference).toBe("available");
    expect(empty.openToOffers).toBe(false);
  });

  it("derives busy from active jobs", () => {
    expect(getEffectiveAvailability("available", 2)).toBe("busy");
    expect(getEffectiveAvailability("busy", 0)).toBe("busy");
    expect(getEffectiveAvailability("unavailable", 3)).toBe("unavailable");
    expect(getEffectiveAvailability("available", 0)).toBe("available");
  });

  it("counts active freelancer jobs", () => {
    const freelancer = "GFREELANCER";
    const jobs = [
      baseJob({ freelancer, status: "InProgress" }),
      baseJob({ freelancer, status: "SubmittedForReview" }),
      baseJob({ freelancer, status: "Completed" }),
      baseJob({ freelancer: "GOTHER", status: "InProgress" }),
    ];
    expect(countActiveJobsAsFreelancer(jobs, freelancer)).toBe(2);
  });

  it("builds freelancer active job count map", () => {
    const map = buildActiveFreelancerJobCountMap([
      { job: baseJob({ freelancer: "GA", status: "InProgress" }) },
      { job: baseJob({ freelancer: "GA", status: "InProgress" }) },
      { job: baseJob({ freelancer: "GB", status: "SubmittedForReview" }) },
    ]);
    expect(map.get("GA")).toBe(2);
    expect(map.get("GB")).toBe(1);
  });
});
