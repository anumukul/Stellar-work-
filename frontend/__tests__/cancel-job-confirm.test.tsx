import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetailPage from "@/app/job/[id]/page";
import { ToastProvider } from "@/components/ToastProvider";
import type { Job } from "@/lib/types";

const mockGetJob = vi.fn();
const mockCancelJob = vi.fn();
const mockUseWallet = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
}));

vi.mock("@/lib/contract", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  acceptJob: vi.fn(),
  submitWork: vi.fn(),
  approveWork: vi.fn(),
  cancelJob: (...args: unknown[]) => mockCancelJob(...args),
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
    confirmSlot: vi.fn(),
    cancelMeeting: vi.fn(),
    completeMeeting: vi.fn(),
    rescheduleProposal: vi.fn(),
    confirmMeeting: vi.fn(),
    getMeetingsForJob: () => [],
    getUpcomingMeetings: () => [],
    getPastMeetings: () => [],
  }),
  MeetingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    client: "GWALLET",
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

describe("Cancel job confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({
      wallet: "GWALLET",
      connectWallet: vi.fn(),
    });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GWALLET" }));
    mockCancelJob.mockResolvedValue({ hash: "TX123" });
  });

  it("requires confirmation before cancelling", async () => {
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Cancel Job")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Cancel Job"));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mockCancelJob).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mockCancelJob).not.toHaveBeenCalled();
  });

  it("cancels only after confirm and supports keyboard focus trap", async () => {
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Cancel Job")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Cancel Job"));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "confirm-dialog-title");

    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel job" }));
    await waitFor(() => expect(mockCancelJob).toHaveBeenCalledWith("GWALLET", "1"));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .some((el) => el.textContent?.includes("Job cancelled and funds refunded.")),
      ).toBe(true),
    );
  });
});
