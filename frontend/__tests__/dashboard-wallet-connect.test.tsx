import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/dashboard/page";

const mockUseWallet = vi.fn();
const mockGetJob = vi.fn();
const mockGetJobCount = vi.fn();
const mockGetCompletedJobsCount = vi.fn();

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => mockUseWallet(),
}));

vi.mock("@/lib/contract", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getJobCount: (...args: unknown[]) => mockGetJobCount(...args),
  getCompletedJobsCount: (...args: unknown[]) => mockGetCompletedJobsCount(...args),
  approveWork: vi.fn(),
  cancelJob: vi.fn(),
  submitWork: vi.fn(),
  enforceDeadline: vi.fn(),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
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

describe("Dashboard wallet connect flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Disconnected state: connect prompt ────────────────────────────────────

  it("renders the Dashboard heading when no wallet is connected", () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("shows the connect-wallet prompt copy when no wallet is connected", () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    render(<DashboardPage />);

    expect(
      screen.getByText("Connect your wallet to view your jobs."),
    ).toBeInTheDocument();
  });

  it("renders the Connect Wallet button when no wallet is connected", () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    render(<DashboardPage />);

    expect(
      screen.getByRole("button", { name: "Connect Wallet" }),
    ).toBeInTheDocument();
  });

  it("does not render job sections or filter chips when disconnected", () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    render(<DashboardPage />);

    expect(screen.queryByText("Posted Jobs")).not.toBeInTheDocument();
    expect(screen.queryByText("Accepted Jobs")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("toolbar", { name: "Filter jobs by status" }),
    ).not.toBeInTheDocument();
  });

  it("does not show the loading skeleton when disconnected", () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    render(<DashboardPage />);

    expect(screen.queryByLabelText("Loading jobs")).not.toBeInTheDocument();
  });

  // ── Connect Wallet button invokes connectWallet ───────────────────────────

  it("calls connectWallet when the Connect Wallet button is clicked", async () => {
    const mockConnect = vi.fn().mockResolvedValue(undefined);
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: mockConnect });
    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));

    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());
  });

  it("does not throw when connectWallet rejects (user cancelled)", async () => {
    const mockConnect = vi.fn().mockRejectedValue(new Error("User cancelled"));
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: mockConnect });
    render(<DashboardPage />);

    // Should not throw — the page swallows the rejection silently
    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));

    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());
    // Connect prompt is still visible after a cancelled attempt
    expect(
      screen.getByText("Connect your wallet to view your jobs."),
    ).toBeInTheDocument();
  });

  // ── Connected state: dashboard content renders ────────────────────────────

  it("shows job sections after a successful wallet connection", async () => {
    const mockConnect = vi.fn();
    // Start disconnected
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: mockConnect });

    mockGetJobCount.mockResolvedValue(0);
    mockGetCompletedJobsCount.mockResolvedValue(0);

    const { rerender } = render(<DashboardPage />);

    // Simulate the wallet context updating after connect
    mockUseWallet.mockReturnValue({
      wallet: "GNEWWALLET",
      connectWallet: mockConnect,
    });
    rerender(<DashboardPage />);

    await waitFor(() =>
      expect(screen.getByText("Posted Jobs")).toBeInTheDocument(),
    );
    expect(screen.getByText("Accepted Jobs")).toBeInTheDocument();
  });

  it("hides the connect prompt after wallet becomes available", async () => {
    const mockConnect = vi.fn();
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: mockConnect });

    mockGetJobCount.mockResolvedValue(0);
    mockGetCompletedJobsCount.mockResolvedValue(0);

    const { rerender } = render(<DashboardPage />);

    expect(
      screen.getByText("Connect your wallet to view your jobs."),
    ).toBeInTheDocument();

    mockUseWallet.mockReturnValue({
      wallet: "GNEWWALLET",
      connectWallet: mockConnect,
    });
    rerender(<DashboardPage />);

    await waitFor(() =>
      expect(
        screen.queryByText("Connect your wallet to view your jobs."),
      ).not.toBeInTheDocument(),
    );
  });

  it("fetches and displays jobs belonging to the connected wallet", async () => {
    mockGetJobCount.mockResolvedValue(1);
    mockGetCompletedJobsCount.mockResolvedValue(0);
    mockGetJob.mockResolvedValue({
      client: "GNEWWALLET",
      freelancer: null,
      amount: "10000000",
      description_hash: "abc",
      status: "Open",
      created_at: "1710000000",
      deadline: "0",
      token: "GTOKEN",
      revision_count: 0,
      submitted_at: "0",
    });

    mockUseWallet.mockReturnValue({
      wallet: "GNEWWALLET",
      connectWallet: vi.fn(),
    });

    render(<DashboardPage />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument(),
    );
  });

  it("shows the filter toolbar once the wallet is connected", async () => {
    mockGetJobCount.mockResolvedValue(0);
    mockGetCompletedJobsCount.mockResolvedValue(0);

    mockUseWallet.mockReturnValue({
      wallet: "GNEWWALLET",
      connectWallet: vi.fn(),
    });

    render(<DashboardPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("toolbar", { name: "Filter jobs by status" }),
      ).toBeInTheDocument(),
    );
  });

  // ── Disconnected again after connecting ───────────────────────────────────

  it("reverts to the connect prompt when wallet is disconnected", async () => {
    const mockConnect = vi.fn();
    mockGetJobCount.mockResolvedValue(0);
    mockGetCompletedJobsCount.mockResolvedValue(0);

    // Start connected
    mockUseWallet.mockReturnValue({
      wallet: "GNEWWALLET",
      connectWallet: mockConnect,
    });

    const { rerender } = render(<DashboardPage />);

    await waitFor(() =>
      expect(screen.getByText("Posted Jobs")).toBeInTheDocument(),
    );

    // Simulate disconnect
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: mockConnect });
    rerender(<DashboardPage />);

    await waitFor(() =>
      expect(
        screen.getByText("Connect your wallet to view your jobs."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Posted Jobs")).not.toBeInTheDocument();
  });
});
