import { describe, it, expect } from "vitest";

import type { Job, JobStatus, Milestone, Notification, NotificationEvent, NotificationPreferences } from "../lib/types";

function isValidJobStatus(status: unknown): status is JobStatus {
  const validStatuses: JobStatus[] = [
    "Open",
    "InProgress",
    "SubmittedForReview",
    "Completed",
    "Cancelled",
    "Disputed",
  ];
  return typeof status === "string" && validStatuses.includes(status as JobStatus);
}

function isValidJob(obj: unknown): obj is Job {
  if (!obj || typeof obj !== "object") return false;
  const j = obj as Record<string, unknown>;
  return (
    typeof j.client === "string" &&
    (j.freelancer === null || typeof j.freelancer === "string") &&
    typeof j.amount === "string" &&
    typeof j.description_hash === "string" &&
    isValidJobStatus(j.status) &&
    typeof j.created_at === "string" &&
    typeof j.deadline === "string" &&
    typeof j.token === "string" &&
    typeof j.revision_count === "number"
  );
}

describe("JobStatus type", () => {
  it("recognizes valid statuses", () => {
    expect(isValidJobStatus("Open")).toBe(true);
    expect(isValidJobStatus("InProgress")).toBe(true);
    expect(isValidJobStatus("SubmittedForReview")).toBe(true);
    expect(isValidJobStatus("Completed")).toBe(true);
    expect(isValidJobStatus("Cancelled")).toBe(true);
    expect(isValidJobStatus("Disputed")).toBe(true);
  });

  it("rejects invalid statuses", () => {
    expect(isValidJobStatus("Pending")).toBe(false);
    expect(isValidJobStatus("")).toBe(false);
    expect(isValidJobStatus(123)).toBe(false);
    expect(isValidJobStatus(null)).toBe(false);
    expect(isValidJobStatus(undefined)).toBe(false);
  });
});

describe("Job type guard", () => {
  it("validates a complete job object", () => {
    const job: Job = {
      client: "GCLIENTADDRESS123",
      freelancer: "GFREELANCERADDR456",
      amount: "1000000",
      description_hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      status: "Open",
      created_at: "1710000000",
      deadline: "1710100000",
      token: "GTOKENADDRESS789",
      revision_count: 0,
    };
    expect(isValidJob(job)).toBe(true);
  });

  it("validates a job with null freelancer", () => {
    const job: Job = {
      client: "GCLIENTADDRESS123",
      freelancer: null,
      amount: "1000000",
      description_hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      status: "Open",
      created_at: "1710000000",
      deadline: "0",
      token: "GTOKENADDRESS789",
      revision_count: 0,
    };
    expect(isValidJob(job)).toBe(true);
  });

  it("rejects incomplete job objects", () => {
    expect(isValidJob({})).toBe(false);
    expect(isValidJob(null)).toBe(false);
    expect(isValidJob(undefined)).toBe(false);
    expect(isValidJob("not a job")).toBe(false);
  });

  it("rejects job with invalid status", () => {
    const job = {
      client: "GCLIENT",
      freelancer: null,
      amount: "100",
      description_hash: "hash",
      status: "InvalidStatus",
      created_at: "time",
      deadline: "0",
      token: "GTOKEN",
      revision_count: 0,
    };
    expect(isValidJob(job)).toBe(false);
  });
});

describe("Milestone type", () => {
  it("accepts a valid milestone", () => {
    const milestone: Milestone = {
      id: 0,
      description_hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      amount: "500000",
      is_released: false,
    };
    expect(milestone.id).toBe(0);
    expect(milestone.amount).toBe("500000");
    expect(milestone.is_released).toBe(false);
  });
});

describe("NotificationEvent type", () => {
  const validEvents: NotificationEvent[] = [
    "job_accepted",
    "work_submitted",
    "work_approved",
    "job_cancelled",
    "dispute_raised",
    "dispute_resolved",
  ];

  it("all valid events are supported", () => {
    expect(validEvents.length).toBe(6);
  });
});

describe("Notification type", () => {
  it("constructs a notification object", () => {
    const notification: Notification = {
      id: "notif-1",
      event: "job_accepted",
      jobId: 42,
      message: "Your job was accepted",
      timestamp: 1710000000,
      seen: false,
    };
    expect(notification.id).toBe("notif-1");
    expect(notification.jobId).toBe(42);
    expect(notification.seen).toBe(false);
  });
});

describe("NotificationPreferences type", () => {
  it("records preferences for all events", () => {
    const prefs: NotificationPreferences = {
      job_accepted: true,
      work_submitted: true,
      work_approved: false,
      job_cancelled: true,
      dispute_raised: true,
      dispute_resolved: false,
    };
    expect(prefs.job_accepted).toBe(true);
    expect(prefs.work_approved).toBe(false);
  });
});
