import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetailPage from "@/app/job/[id]/page";
import { ToastProvider } from "@/components/ToastProvider";
import type { Job } from "@/lib/types";

const mockGetJob = vi.fn();
const mockUseWallet = vi.fn();
let mockRouteId = "1";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: mockRouteId }),
}));

vi.mock("@/lib/contract", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  acceptJob: vi.fn(),
  submitWork: vi.fn(),
  approveWork: vi.fn(),
  cancelJob: vi.fn(),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

vi.mock("@/lib/ipfs-service", () => ({
  uploadToIpfs: vi.fn(),
  fetchFromIpfs: vi.fn(),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => mockUseWallet(),
}));

vi.mock("@/lib/notifications-context", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    addNotification: vi.fn(),
    markAsSeen: vi.fn(),
    markAllAsSeen: vi.fn(),
    preferences: { job_accepted: true, work_submitted: true, work_approved: true, job_cancelled: true, dispute_raised: true, dispute_resolved: true },
    setPreference: vi.fn(),
    clearNotifications: vi.fn(),
  }),
  NotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getEventLabel: (event: string) => event,
}));

vi.mock("@/lib/meetings-context", () => ({
  useMeetings: () => ({
    meetings: [],
    proposeMeeting: vi.fn(),
    cancelMeeting: vi.fn(),
    confirmMeeting: vi.fn(),
    getMeetingsForJob: () => [],
    getUpcomingMeetings: () => [],
    getPastMeetings: () => [],
  }),
  MeetingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
    submitted_at: "0",
    ...overrides,
  };
}

function renderJobPage() {
  return render(
    <ToastProvider>
      <JobDetailPage />
    </ToastProvider>,
  );
}

describe("isClient role detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteId = "1";
    mockUseWallet.mockReturnValue({
      wallet: "GWALLET",
      connectWallet: vi.fn(),
    });
  });

  it("detects client as true when wallet matches job.client for an Open job", async () => {
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GWALLET" }));
    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Cancel Job")).toBeInTheDocument();
    });
  });

  it("detects client as false when wallet does not match job.client", async () => {
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GOTHER" }));
    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Job #1")).toBeInTheDocument();
    });

    expect(screen.queryByText("Cancel Job")).not.toBeInTheDocument();
    expect(screen.getByText("Accept Job")).toBeInTheDocument();
  });

  it("detects client as false when wallet is undefined", async () => {
    mockUseWallet.mockReturnValue({
      wallet: null,
      connectWallet: vi.fn(),
    });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GWALLET" }));
    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Job #1")).toBeInTheDocument();
    });

    expect(screen.queryByText("Cancel Job")).not.toBeInTheDocument();
  });

  it("shows approve work only when wallet matches client and status is SubmittedForReview", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({
        status: "SubmittedForReview",
        client: "GWALLET",
        freelancer: "GFREELANCER",
      }),
    );
    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Approve Work")).toBeInTheDocument();
    });
  });

  it("does not show approve work when wallet does not match client", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({
        status: "SubmittedForReview",
        client: "GOTHER",
        freelancer: "GFREELANCER",
      }),
    );
    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText(/Job #1/)).toBeInTheDocument();
    });

    expect(screen.queryByText("Approve Work")).not.toBeInTheDocument();
  });
});

describe("isFreelancer role detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteId = "1";
    mockUseWallet.mockReturnValue({
      wallet: "GWALLET",
      connectWallet: vi.fn(),
    });
  });

  it("detects freelancer as true when wallet matches job.freelancer for InProgress job", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({
        status: "InProgress",
        client: "GCLIENT",
        freelancer: "GWALLET",
      }),
    );
    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Submit Work")).toBeInTheDocument();
    });
  });

  it("detects freelancer as false when wallet does not match job.freelancer", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({
        status: "InProgress",
        client: "GCLIENT",
        freelancer: "GOTHER",
      }),
    );
    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText(/Job #1/)).toBeInTheDocument();
    });

    expect(screen.queryByText("Submit Work")).not.toBeInTheDocument();
  });

  it("detects freelancer as false when wallet is undefined", async () => {
    mockUseWallet.mockReturnValue({
      wallet: null,
      connectWallet: vi.fn(),
    });
    mockGetJob.mockResolvedValue(
      makeJob({
        status: "InProgress",
        client: "GCLIENT",
        freelancer: "GWALLET",
      }),
    );
    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText(/Job #1/)).toBeInTheDocument();
    });

    expect(screen.queryByText("Submit Work")).not.toBeInTheDocument();
  });

  it("detects both isClient and isFreelancer as false when wallet does not match any participant", async () => {
    mockUseWallet.mockReturnValue({
      wallet: "GUNRELATED",
      connectWallet: vi.fn(),
    });
    mockGetJob.mockResolvedValue(
      makeJob({
        status: "Open",
        client: "GCLIENT",
        freelancer: null,
      }),
    );
    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText(/Job #1/)).toBeInTheDocument();
    });

    expect(screen.queryByText("Cancel Job")).not.toBeInTheDocument();
    expect(screen.queryByText("Submit Work")).not.toBeInTheDocument();
    expect(screen.queryByText("Approve Work")).not.toBeInTheDocument();
    expect(screen.getByText("Accept Job")).toBeInTheDocument();
  });
});
