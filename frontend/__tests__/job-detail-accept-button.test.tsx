import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetailPage, { canWalletAcceptJob } from "@/app/job/[id]/page";
import { ToastProvider } from "@/components/ToastProvider";
import type { Job, JobStatus } from "@/lib/types";

const mockGetJob = vi.fn();
const mockAcceptJob = vi.fn();
const mockUseWallet = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
}));

vi.mock("@/lib/contract", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  acceptJob: (...args: unknown[]) => mockAcceptJob(...args),
  submitWork: vi.fn(),
  approveWork: vi.fn(),
  cancelJob: vi.fn(),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
  getJobEscrowBalance: vi.fn().mockResolvedValue("10000000"),
  getPlatformFeeRate: vi.fn().mockResolvedValue(250),
  getActiveContractId: vi.fn().mockReturnValue("CCONTRACT"),
  getJobViews: vi.fn().mockResolvedValue(0),
  recordJobView: vi.fn().mockResolvedValue(undefined),
  rateJob: vi.fn(),
  topUpEscrow: vi.fn(),
  getJobCount: vi.fn().mockResolvedValue(0),
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
    preferences: {
      job_accepted: true,
      work_submitted: true,
      work_approved: true,
      job_cancelled: true,
      dispute_raised: true,
      dispute_resolved: true,
    },
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

describe("Job detail accept button visibility and guard (BUG-42 / #1177)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcceptJob.mockResolvedValue({ hash: "tx-accept-1" });
    mockUseWallet.mockReturnValue({
      wallet: "GWALLET",
      connectWallet: vi.fn(),
    });
  });

  describe("canWalletAcceptJob predicate", () => {
    it("allows a connected non-client wallet on an Open job", () => {
      expect(
        canWalletAcceptJob({ status: "Open", client: "GCLIENT" }, "GFREELANCER"),
      ).toBe(true);
    });

    it("rejects the job owner (client) wallet even when status is Open", () => {
      expect(
        canWalletAcceptJob({ status: "Open", client: "GCLIENT" }, "GCLIENT"),
      ).toBe(false);
    });

    it("rejects a disconnected wallet", () => {
      expect(canWalletAcceptJob({ status: "Open", client: "GCLIENT" }, null)).toBe(
        false,
      );
      expect(
        canWalletAcceptJob({ status: "Open", client: "GCLIENT" }, undefined),
      ).toBe(false);
    });

    it.each<JobStatus>([
      "InProgress",
      "SubmittedForReview",
      "Completed",
      "Cancelled",
      "Disputed",
    ])("rejects non-Open status %s", (status) => {
      expect(
        canWalletAcceptJob({ status, client: "GCLIENT" }, "GFREELANCER"),
      ).toBe(false);
    });
  });

  it("shows Accept Job for open jobs when connected as a non-client wallet and submits acceptance", async () => {
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GCLIENT" }));
    renderJobPage();

    const acceptBtn = await screen.findByRole("button", { name: "Accept Job" });
    expect(acceptBtn).toBeEnabled();

    fireEvent.click(acceptBtn);

    // Confirm inside the Accept Job modal
    const modalButtons = await screen.findAllByRole("button", { name: "Accept Job" });
    fireEvent.click(modalButtons[modalButtons.length - 1]);

    await waitFor(() => {
      expect(mockAcceptJob).toHaveBeenCalledTimes(1);
      expect(mockAcceptJob).toHaveBeenCalledWith("GWALLET", "1");
    });
  });

  it("does NOT expose Accept Job to the job client (owner) and shows client actions instead", async () => {
    mockUseWallet.mockReturnValue({
      wallet: "GCLIENT",
      connectWallet: vi.fn(),
    });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GCLIENT" }));
    renderJobPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel Job" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Add Funds" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept Job" })).not.toBeInTheDocument();
    expect(mockAcceptJob).not.toHaveBeenCalled();
  });

  it("hides Accept Job and shows Connect Wallet when wallet is disconnected", async () => {
    mockUseWallet.mockReturnValue({
      wallet: null,
      connectWallet: vi.fn(),
    });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GCLIENT" }));
    renderJobPage();

    const connectBtn = await screen.findByRole("button", { name: "Connect Wallet" });
    expect(connectBtn).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept Job" })).not.toBeInTheDocument();
  });

  it.each<JobStatus>([
    "InProgress",
    "SubmittedForReview",
    "Completed",
    "Cancelled",
    "Disputed",
  ])("hides Accept Job for %s jobs", async (status) => {
    mockGetJob.mockResolvedValue(
      makeJob({
        status,
        client: "GCLIENT",
        freelancer: "GFREELANCER",
      }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Accept Job" })).not.toBeInTheDocument();
  });

  it("closes the accept modal and blocks self-acceptance if wallet switches to the job client", async () => {
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GCLIENT" }));
    const { rerender } = renderJobPage();

    const acceptBtn = await screen.findByRole("button", { name: "Accept Job" });
    fireEvent.click(acceptBtn);

    expect(
      screen.getByPlaceholderText(/Write a brief note about why you're a good fit/i),
    ).toBeInTheDocument();

    // Switch wallet to the job owner while modal was open
    mockUseWallet.mockReturnValue({
      wallet: "GCLIENT",
      connectWallet: vi.fn(),
    });
    rerender(
      <ToastProvider>
        <JobDetailPage />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(/Write a brief note about why you're a good fit/i),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Accept Job" })).not.toBeInTheDocument();
    expect(mockAcceptJob).not.toHaveBeenCalled();
  });
});
