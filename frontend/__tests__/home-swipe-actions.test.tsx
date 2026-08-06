import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const mockAcceptJob = vi.fn();
const mockCancelJob = vi.fn();
const mockAddNotification = vi.fn();

vi.mock("@/lib/contract", () => ({
  getJobCount: (...args: unknown[]) => mockGetJobCount(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  acceptJob: (...args: unknown[]) => mockAcceptJob(...args),
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
  useWallet: () => ({
    wallet: "GCLIENT",
    connectWallet: vi.fn(),
  }),
}));

vi.mock("@/lib/notifications-context", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    addNotification: (...args: unknown[]) => mockAddNotification(...args),
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

// Force the mobile gesture layer on inside jsdom and keep springs instant.
vi.mock("@/lib/swipe-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/swipe-actions")>();
  return {
    ...actual,
    isCoarsePointerDevice: () => true,
  };
});

const OWN_OPEN_JOB = {
  client: "GCLIENT",
  freelancer: null,
  amount: "10000000",
  description_hash: "hash-one",
  status: "Open",
  created_at: "1710000002",
  deadline: "0",
  token: "GTOKEN",
  revision_count: 0,
  submitted_at: "0",
};

describe("Home page mobile swipe quick actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    mockGetJobCount.mockResolvedValue(1);
    mockGetJob.mockResolvedValue(OWN_OPEN_JOB);
    mockCancelJob.mockResolvedValue({ hash: "cancel-tx-hash" });
  });

  it("wraps each listed job card in the swipe quick-actions layer", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("swipe-card-1")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("group", { name: "Job #1 quick actions" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("swipe-card-1")).toBeInTheDocument();
  });

  it("offers role-aware actions: the client sees Cancel, not Accept", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("swipe-card-1")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByTestId("swipe-card-1"));

    expect(screen.getByRole("menuitem", { name: "Bookmark job" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Cancel job" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Accept job" })).not.toBeInTheDocument();
  });

  it("swipe Cancel action opens the confirmation modal and cancels the job", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("swipe-card-1")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByTestId("swipe-card-1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel job" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Cancel job #1?");

    fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));

    await waitFor(() => {
      expect(mockCancelJob).toHaveBeenCalledWith("GCLIENT", "1");
    });
    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith(
        "job_cancelled",
        1,
        "You cancelled Job #1.",
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("dismisses the cancel confirmation without calling the contract", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("swipe-card-1")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByTestId("swipe-card-1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel job" }));

    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Keep job" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(mockCancelJob).not.toHaveBeenCalled();
  });

  it("swipe Bookmark action toggles the existing save state", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("swipe-card-1")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByTestId("swipe-card-1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Bookmark job" }));

    expect(screen.getByRole("button", { name: "★ Saved" })).toBeInTheDocument();
    expect(mockAddNotification).not.toHaveBeenCalled();
  });
});
