import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
    toString: vi.fn().mockReturnValue(""),
  }),
}));

const mockGetJobCount = vi.fn();
const mockGetJob = vi.fn();

vi.mock("@/lib/contract", () => ({
  getJobCount: (...args: unknown[]) => mockGetJobCount(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  acceptJob: vi.fn(),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

vi.mock("@/lib/ipfs-service", () => ({
  uploadToIpfs: vi.fn(),
  fetchFromIpfs: vi.fn(),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => ({
    wallet: null,
    connectWallet: vi.fn(),
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

describe("Home page empty job state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows the empty state message when no jobs exist", async () => {
    mockGetJobCount.mockResolvedValue(0);

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByText("No open jobs found")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("New jobs will appear here as clients post them."),
    ).toBeInTheDocument();
  });

  it("shows the post job CTA in the hero section", async () => {
    mockGetJobCount.mockResolvedValue(0);

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByText("No open jobs found")).toBeInTheDocument(),
    );

    const postJobLink = screen.getByRole("link", { name: "Post a Job" });
    expect(postJobLink).toBeInTheDocument();
    expect(postJobLink).toHaveAttribute("href", "/post-job");
  });

  it("does not render job cards when the feed is empty", async () => {
    mockGetJobCount.mockResolvedValue(0);

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByText("No open jobs found")).toBeInTheDocument(),
    );

    expect(screen.queryByRole("heading", { name: /^Job #/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept Job" })).not.toBeInTheDocument();
    expect(mockGetJob).not.toHaveBeenCalled();
  });
});
