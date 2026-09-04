import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Next.js modules
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock wallet context
const mockUseWallet = vi.fn();
vi.mock("@/lib/wallet-context", () => ({
  useWallet: mockUseWallet,
}));

// Mock toast provider
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}));

// Mock contract functions
vi.mock("@/lib/contract", () => ({
  getJob: vi.fn(),
  acceptJob: vi.fn(),
  submitWork: vi.fn(),
  approveWork: vi.fn(),
  cancelJob: vi.fn(),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

// Mock IPFS service
vi.mock("@/lib/ipfs-service", () => ({
  uploadToIpfs: vi.fn(),
  fetchFromIpfs: vi.fn(),
}));

// Mock stellar utilities
vi.mock("@/lib/stellar", () => ({
  getExplorerTxUrl: (hash: string) => `https://stellar.expert/tx/${hash}`,
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

describe("Job Detail Mobile Footer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({
      wallet: "GTEST123",
      connectWallet: vi.fn(),
      disconnectWallet: vi.fn(),
      switchAccount: vi.fn(),
      clearCachedData: vi.fn(),
      isSwitching: false,
    });
  });

  it("renders sticky footer on mobile with proper spacing", async () => {
    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: null,
      amount: "10000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    const { container } = render(<JobDetailPage />);

    // Wait for job to load
    await screen.findByText(/Job #1/);

    // Check for mobile spacer (hidden on desktop)
    const spacer = container.querySelector('[aria-hidden="true"].h-20.sm\\:hidden');
    expect(spacer).toBeInTheDocument();

    // Check for sticky footer with proper classes
    const footer = container.querySelector(".fixed.inset-x-0.bottom-0");
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveClass("z-20", "border-t", "bg-white/95", "backdrop-blur-sm");

    // Verify footer becomes static on desktop (sm: breakpoint)
    expect(footer).toHaveClass("sm:static", "sm:border-0", "sm:bg-transparent");
  });

  it("does not render spacer when no actions available", async () => {
    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: "GFREELANCER123",
      amount: "10000000",
      description_hash: "abc123",
      status: "Completed",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    const { container } = render(<JobDetailPage />);

    await screen.findByText(/Job #1/);

    // No spacer should be present when no actions are available
    const spacer = container.querySelector('[aria-hidden="true"].h-20');
    expect(spacer).not.toBeInTheDocument();

    // No footer should be present
    const footer = container.querySelector(".fixed.inset-x-0.bottom-0");
    expect(footer).not.toBeInTheDocument();
  });

  it("footer buttons have proper mobile sizing", async () => {
    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: null,
      amount: "10000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    render(<JobDetailPage />);

    await screen.findByText(/Job #1/);

    const acceptButton = await screen.findByRole("button", { name: /Accept Job/ });
    
    // Check mobile-first sizing (flex-1 for full width)
    expect(acceptButton).toHaveClass("flex-1", "min-w-0");
    
    // Check desktop sizing (flex-none with max width)
    expect(acceptButton).toHaveClass("sm:flex-none", "sm:max-w-48");
    
    // Check mobile padding is larger
    expect(acceptButton).toHaveClass("py-2.5", "sm:py-2");
  });

  it("renders correctly at small mobile viewport (iPhone SE)", async () => {
    // Set viewport to iPhone SE size (375x667)
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 667,
    });
    window.dispatchEvent(new Event('resize'));

    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: null,
      amount: "10000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    const { container } = render(<JobDetailPage />);

    await screen.findByText(/Job #1/);

    // Verify footer is still fixed at bottom
    const footer = container.querySelector(".fixed.inset-x-0.bottom-0");
    expect(footer).toBeInTheDocument();

    // Verify spacer is present on mobile
    const spacer = container.querySelector('[aria-hidden="true"].h-20.sm\\:hidden');
    expect(spacer).toBeInTheDocument();
  });

  it("renders correctly at large mobile viewport (iPhone 12 Pro)", async () => {
    // Set viewport to iPhone 12 Pro size (390x844)
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 844,
    });
    window.dispatchEvent(new Event('resize'));

    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: null,
      amount: "10000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    const { container } = render(<JobDetailPage />);

    await screen.findByText(/Job #1/);

    // Verify footer is still fixed at bottom
    const footer = container.querySelector(".fixed.inset-x-0.bottom-0");
    expect(footer).toBeInTheDocument();

    // Verify buttons are full width on mobile
    const acceptButton = await screen.findByRole("button", { name: /Accept Job/ });
    expect(acceptButton).toHaveClass("flex-1");
  });

  it("disables action buttons when loading on mobile", async () => {
    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: null,
      amount: "10000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    // Mock acceptJob to simulate loading state
    const { acceptJob } = await import("@/lib/contract");
    vi.mocked(acceptJob).mockImplementation(() => new Promise(() => { void 0; })); // Never resolves

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    render(<JobDetailPage />);

    await screen.findByText(/Job #1/);

    const acceptButton = await screen.findByRole("button", { name: /Accept Job/ });
    
    // Click to trigger loading
    await act(async () => {
      fireEvent.click(acceptButton);
    });

    // Button should be disabled and show "Processing..."
    await expect(acceptButton).toBeDisabled();
    expect(acceptButton).toHaveTextContent("Processing...");
    expect(acceptButton).toHaveAttribute("aria-busy", "true");
  });

  it("disables action buttons when wallet not connected on mobile", async () => {
    const { useWallet } = await import("@/lib/wallet-context");
    vi.mocked(useWallet).mockReturnValue({
      wallet: null,
      walletNetwork: null,
      connectWallet: vi.fn(),
      disconnectWallet: vi.fn(),
      switchAccount: vi.fn(),
      clearCachedData: vi.fn(),
      refreshWalletNetwork: vi.fn(),
      isSwitching: false,
    });

    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: null,
      amount: "10000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    render(<JobDetailPage />);

    await screen.findByText(/Job #1/);

    const acceptButton = await screen.findByRole("button", { name: /Accept Job/ });
    
    // Button should be disabled when wallet not connected
    expect(acceptButton).toBeDisabled();
    expect(acceptButton).toHaveAttribute("title", "Connect your wallet to accept this job.");
  });

  it("enables action buttons when wallet connected on mobile", async () => {
    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: null,
      amount: "10000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    render(<JobDetailPage />);

    await screen.findByText(/Job #1/);

    const acceptButton = await screen.findByRole("button", { name: /Accept Job/ });
    
    // Button should be enabled when wallet is connected
    expect(acceptButton).not.toBeDisabled();
  });

  it("shows correct disabled styling for mobile footer buttons", async () => {
    const { useWallet } = await import("@/lib/wallet-context");
    vi.mocked(useWallet).mockReturnValue({
      wallet: null,
      walletNetwork: null,
      connectWallet: vi.fn(),
      disconnectWallet: vi.fn(),
      switchAccount: vi.fn(),
      clearCachedData: vi.fn(),
      refreshWalletNetwork: vi.fn(),
      isSwitching: false,
    });

    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: null,
      amount: "10000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    render(<JobDetailPage />);

    await screen.findByText(/Job #1/);

    const acceptButton = await screen.findByRole("button", { name: /Accept Job/ });
    
    // Check disabled styling classes
    expect(acceptButton).toHaveClass(
      "disabled:cursor-not-allowed",
      "disabled:border-slate-300",
      "disabled:bg-slate-200",
      "disabled:text-slate-500"
    );
  });

  it("footer does not overlap content on mobile with long content", async () => {
    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: null,
      amount: "10000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    // Mock localStorage to return a long description
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "This is a very long job description that should not overlap with the sticky footer on mobile devices. ".repeat(10)),
      setItem: vi.fn(),
    });

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    const { container } = render(<JobDetailPage />);

    await screen.findByText(/Job #1/);

    // Verify spacer is present to prevent overlap
    const spacer = container.querySelector('[aria-hidden="true"].h-20.sm\\:hidden');
    expect(spacer).toBeInTheDocument();

    // Verify footer has proper z-index to stay on top
    const footer = container.querySelector(".fixed.inset-x-0.bottom-0");
    expect(footer).toHaveClass("z-20");
  });

  it("matches snapshot for mobile footer with actions", async () => {
    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: null,
      amount: "10000000",
      description_hash: "abc123",
      status: "Open",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    const { container } = render(<JobDetailPage />);

    await screen.findByText(/Job #1/);

    // Snapshot the footer component
    const footer = container.querySelector(".fixed.inset-x-0.bottom-0");
    expect(footer).toMatchSnapshot();
  });

  it("matches snapshot for mobile footer without actions", async () => {
    const { getJob } = await import("@/lib/contract");
    vi.mocked(getJob).mockResolvedValue({
      client: "GCLIENT123",
      freelancer: "GFREELANCER123",
      amount: "10000000",
      description_hash: "abc123",
      status: "Completed",
      created_at: "1234567890",
      deadline: "0",
      token: "GTOKEN123",
      revision_count: 0,
      submitted_at: "0",
    });

    const JobDetailPage = (await import("@/app/job/[id]/page")).default;
    const { container } = render(<JobDetailPage />);

    await screen.findByText(/Job #1/);

    // Snapshot the page when no footer should be present
    expect(container).toMatchSnapshot();
  });
});
