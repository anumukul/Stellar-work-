import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetailPage from "@/app/job/[id]/page";
import { ToastProvider } from "@/components/ToastProvider";
import * as contract from "@/lib/contract";
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

describe("Job detail page integration", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({
      wallet: "GWALLET",
      connectWallet: vi.fn(),
    });
  });

  it("calls acceptJob with correct arguments and handles success", async () => {
    mockGetJob.mockResolvedValue(makeJob({ status: "Open" }));
    vi.mocked(contract.acceptJob).mockResolvedValue({ hash: "txhash123", status: "SUCCESS" });

    renderJobPage();

    const acceptButton = await screen.findByRole("button", { name: "Accept Job" });
    await user.click(acceptButton);

    expect(contract.acceptJob).toHaveBeenCalledWith("GWALLET", "1");
    await waitFor(() => {
      expect(screen.getByText("Job accepted successfully.")).toBeInTheDocument();
    });
  });

  it("calls acceptJob and displays error on failure", async () => {
    mockGetJob.mockResolvedValue(makeJob({ status: "Open" }));
    vi.mocked(contract.acceptJob).mockRejectedValue(new Error("Accept failed"));

    renderJobPage();

    const acceptButton = await screen.findByRole("button", { name: "Accept Job" });
    await user.click(acceptButton);

    expect(contract.acceptJob).toHaveBeenCalledWith("GWALLET", "1");
    await waitFor(() => {
      expect(screen.getByText("Accept failed")).toBeInTheDocument();
    });
  });

  it("calls submitWork with correct arguments via confirm dialog", async () => {
    mockUseWallet.mockReturnValue({
      wallet: "GFREELANCER",
      connectWallet: vi.fn(),
    });
    mockGetJob.mockResolvedValue(
      makeJob({ status: "InProgress", freelancer: "GFREELANCER" })
    );
    vi.mocked(contract.submitWork).mockResolvedValue({ hash: "txhash456", status: "SUCCESS" });

    renderJobPage();

    const submitButton = await screen.findByRole("button", { name: "Submit Work" });
    await user.click(submitButton);

    const confirmButton = await screen.findByRole("button", { name: "Yes, submit work" });
    await user.click(confirmButton);

    expect(contract.submitWork).toHaveBeenCalledWith("GFREELANCER", "1");
    await waitFor(() => {
      expect(screen.getByText("Work submitted for review.")).toBeInTheDocument();
    });
  });

  it("calls approveWork with correct arguments via confirm dialog", async () => {
    mockUseWallet.mockReturnValue({
      wallet: "GCLIENT",
      connectWallet: vi.fn(),
    });
    mockGetJob.mockResolvedValue(
      makeJob({ status: "SubmittedForReview", client: "GCLIENT", freelancer: "GFREELANCER" })
    );
    vi.mocked(contract.approveWork).mockResolvedValue({ hash: "txhash789", status: "SUCCESS" });

    renderJobPage();

    const approveButton = await screen.findByRole("button", { name: "Approve Work" });
    await user.click(approveButton);

    const confirmButton = await screen.findByRole("button", { name: "Yes, approve & pay" });
    await user.click(confirmButton);

    expect(contract.approveWork).toHaveBeenCalledWith("GCLIENT", "1");
    await waitFor(() => {
      expect(screen.getByText("Work approved and payment released.")).toBeInTheDocument();
    });
  });

  it("calls cancelJob with correct arguments via confirm dialog", async () => {
    mockUseWallet.mockReturnValue({
      wallet: "GCLIENT",
      connectWallet: vi.fn(),
    });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GCLIENT" }));
    vi.mocked(contract.cancelJob).mockResolvedValue({ hash: "txhash000", status: "SUCCESS" });

    renderJobPage();

    const cancelButton = await screen.findByRole("button", { name: "Cancel Job" });
    await user.click(cancelButton);

    const confirmButton = await screen.findByRole("button", { name: "Yes, cancel job" });
    await user.click(confirmButton);

    expect(contract.cancelJob).toHaveBeenCalledWith("GCLIENT", "1");
    await waitFor(() => {
      expect(screen.getByText("Job cancelled and funds refunded.")).toBeInTheDocument();
    });
  });

  it("displays error when cancelJob fails", async () => {
    mockUseWallet.mockReturnValue({
      wallet: "GCLIENT",
      connectWallet: vi.fn(),
    });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GCLIENT" }));
    vi.mocked(contract.cancelJob).mockRejectedValue(new Error("Cancel failed"));

    renderJobPage();

    const cancelButton = await screen.findByRole("button", { name: "Cancel Job" });
    await user.click(cancelButton);

    const confirmButton = await screen.findByRole("button", { name: "Yes, cancel job" });
    await user.click(confirmButton);

    expect(contract.cancelJob).toHaveBeenCalledWith("GCLIENT", "1");
    await waitFor(() => {
      expect(screen.getByText("Cancel failed")).toBeInTheDocument();
    });
  });
});
