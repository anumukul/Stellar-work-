import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetailPage from "@/app/job/[id]/page";
import { ToastProvider } from "@/components/ToastProvider";

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

function renderJobPage() {
  return render(
    <ToastProvider>
      <JobDetailPage />
    </ToastProvider>,
  );
}

describe("Job page when getJob returns null", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteId = "1";
    mockUseWallet.mockReturnValue({
      wallet: "GWALLET",
      connectWallet: vi.fn(),
    });
  });

  it("shows a user-visible not-found message when getJob resolves to null", async () => {
    mockGetJob.mockResolvedValue(null);

    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Job not found.")).toBeInTheDocument();
    });
  });

  it("does not leave infinite loading when getJob resolves to null", async () => {
    mockGetJob.mockResolvedValue(null);

    renderJobPage();

    await waitFor(() => {
      expect(screen.queryByText("Loading job details...")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Job not found.")).toBeInTheDocument();
  });

  it("renders back-to-home link when job is not found", async () => {
    mockGetJob.mockResolvedValue(null);

    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Back to Home")).toBeInTheDocument();
    });

    const backLink = screen.getByRole("link", { name: "Back to Home" });
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("does not render action buttons when job is not found", async () => {
    mockGetJob.mockResolvedValue(null);

    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Job not found.")).toBeInTheDocument();
    });

    expect(screen.queryByText("Accept Job")).not.toBeInTheDocument();
    expect(screen.queryByText("Submit Work")).not.toBeInTheDocument();
    expect(screen.queryByText("Approve Work")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel Job")).not.toBeInTheDocument();
  });

  it("shows invalid ID message for non-numeric id", async () => {
    mockRouteId = "abc";

    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Invalid Job ID")).toBeInTheDocument();
    });

    expect(screen.getByText(/Invalid job ID/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeInTheDocument();
  });

  it("shows invalid ID message for negative id", async () => {
    mockRouteId = "-5";

    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Invalid Job ID")).toBeInTheDocument();
    });
  });

  it("shows invalid ID message for zero id", async () => {
    mockRouteId = "0";

    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Invalid Job ID")).toBeInTheDocument();
    });
  });

  it("shows invalid ID message for float id", async () => {
    mockRouteId = "1.5";

    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Invalid Job ID")).toBeInTheDocument();
    });
  });

  it("shows a retry button when a network error occurs", async () => {
    mockGetJob.mockRejectedValue(new Error("Failed to load job."));

    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load job.")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByText("Back to Home")).toBeInTheDocument();
  });

  it("does not show retry button for 'Job not found' state", async () => {
    mockGetJob.mockResolvedValue(null);

    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Job not found.")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("recovers from null to loaded state on subsequent valid fetch", async () => {
    mockGetJob.mockResolvedValue(null);

    renderJobPage();

    await waitFor(() => {
      expect(screen.getByText("Job not found.")).toBeInTheDocument();
    });
  });
});
