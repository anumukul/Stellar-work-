import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetailPage from "@/app/job/[id]/page";
import type { Job } from "@/lib/types";

const mockGetJob = vi.fn();
const mockUseWallet = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
}));

vi.mock("@/lib/contract", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  acceptJob: vi.fn(),
  submitWork: vi.fn(),
  approveWork: vi.fn(),
  cancelJob: vi.fn(),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => mockUseWallet(),
}));

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    client: "GCLIENT",
    freelancer: null,
    amount: "10000000",
    description_hash: "abc",
    status: "Open",
    created_at: "1710000000",
    deadline: "0",
    token: "GTOKEN",
    revision_count: 0,
    ...overrides,
  };
}

describe("Job detail action visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({
      wallet: "GWALLET",
      connectWallet: vi.fn(),
    });
  });

  it("shows open-state actions correctly by role", async () => {
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GWALLET" }));
    render(<JobDetailPage />);

    await waitFor(() => expect(screen.getByText("Cancel Job")).toBeInTheDocument());
    expect(screen.getByText("Accept Job")).toBeInTheDocument();
    expect(screen.queryByText("Submit Work")).not.toBeInTheDocument();
    expect(screen.queryByText("Approve Work")).not.toBeInTheDocument();
  });

  it("shows submit action only for assigned freelancer in progress", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({
        status: "InProgress",
        client: "GCLIENT",
        freelancer: "GWALLET",
      }),
    );
    render(<JobDetailPage />);

    await waitFor(() => expect(screen.getByText("Submit Work")).toBeInTheDocument());
    expect(screen.queryByText("Approve Work")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel Job")).not.toBeInTheDocument();
  });

  it("shows approve action only for client in submitted state", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({
        status: "SubmittedForReview",
        client: "GWALLET",
        freelancer: "GFREELANCER",
      }),
    );
    render(<JobDetailPage />);

    await waitFor(() => expect(screen.getByText("Approve Work")).toBeInTheDocument());
    expect(screen.queryByText("Submit Work")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel Job")).not.toBeInTheDocument();
  });
});
