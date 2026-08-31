import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
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

function makeJob(overrides: Partial<{
  amount: string;
  description_hash: string;
  created_at: string;
}> = {}) {
  return {
    client: "GCLIENT",
    freelancer: null,
    amount: overrides.amount ?? "10000000",
    description_hash: overrides.description_hash ?? "hash-one",
    status: "Open",
    created_at: overrides.created_at ?? "1710000000",
    deadline: "0",
    token: "GTOKEN",
    revision_count: 0,
    submitted_at: "0",
  };
}

describe("Job comparison feature (FE-72)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    mockGetJobCount.mockResolvedValue(2);
    mockGetJob
      .mockResolvedValueOnce(makeJob({ description_hash: "hash-one", created_at: "1710000001" }))
      .mockResolvedValueOnce(makeJob({ description_hash: "hash-two", created_at: "1710000000" }));
  });

  it("renders a Compare checkbox for each job card", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox", { name: /Select Job #\d+ for comparison/ });
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it("shows comparison bar after selecting a job", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument();
    });

    const firstCheckbox = screen.getAllByRole("checkbox", { name: /Select Job #\d+ for comparison/ })[0];
    fireEvent.click(firstCheckbox);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Job comparison bar" })).toBeInTheDocument();
    });
  });

  it("enables Compare link when 2+ jobs are selected", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox", { name: /Select Job #\d+ for comparison/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    await waitFor(() => {
      const compareLink = screen.getByRole("link", { name: "Compare" });
      expect(compareLink).toBeInTheDocument();
      expect(compareLink).not.toHaveAttribute("aria-disabled", "true");
    });
  });

  it("clears all selections when Clear is clicked in comparison bar", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox", { name: /Select Job #\d+ for comparison/ });
    fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Job comparison bar" })).toBeInTheDocument();
    });

    const bar = screen.getByRole("region", { name: "Job comparison bar" });
    const clearBtn = within(bar).getByRole("button", { name: "Clear" });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Job comparison bar" })).not.toBeInTheDocument();
    });
  });
});
