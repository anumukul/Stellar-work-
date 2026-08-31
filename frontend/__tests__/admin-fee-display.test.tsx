import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── FE-TEST-17 (#296): admin page fee display ────────────────────────────────
//
// The admin "Platform Fees" card formats the accrued fee (stroops → XLM, 2dp),
// labels it, and stays robust when the fee is zero/missing. Fee changes in the
// underlying admin data must surface in the UI on the next fetch.

const mockGetFees = vi.fn();
const mockGetNativeToken = vi.fn();
const mockGetJobCount = vi.fn();
const mockGetJob = vi.fn();
const mockWithdrawFees = vi.fn();

vi.mock("@/lib/contract", () => ({
  getFees: (...args: unknown[]) => mockGetFees(...args),
  getNativeToken: (...args: unknown[]) => mockGetNativeToken(...args),
  getJobCount: (...args: unknown[]) => mockGetJobCount(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  withdrawFees: (...args: unknown[]) => mockWithdrawFees(...args),
  adminGetJobCount: vi.fn().mockResolvedValue(0),
  adminGetAllJobs: vi.fn().mockResolvedValue([]),
  getJobStatusCounts: vi.fn().mockResolvedValue({ open: 0, in_progress: 0, submitted_for_review: 0, completed: 0, cancelled: 0, disputed: 0, total: 0 }),
  isWhitelistModeEnabled: vi.fn().mockResolvedValue(false),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

// The admin gate uses the wallet address; keep it mutable so a re-render can
// simulate "admin data changed" by re-triggering the fetch effect.
let mockWallet: string | null = "GADMINWALLET";
vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => ({ wallet: mockWallet, connectWallet: vi.fn() }),
}));

// Real formatter (toXlm) is exercised on purpose — formatting is under test.
import AdminPage from "@/app/admin/page";

describe("Admin page fee display (FE-TEST-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWallet = "GADMINWALLET";
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = "GADMINWALLET";
    // Sensible defaults so the admin view renders; individual tests override fees.
    mockGetNativeToken.mockResolvedValue("GTOKEN");
    mockGetJobCount.mockResolvedValue(0);
    mockGetJob.mockResolvedValue(null);
    mockGetFees.mockResolvedValue(0);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the accrued fee with correct XLM formatting and label", async () => {
    // 25_000_000 stroops = 2.50 XLM.
    mockGetFees.mockResolvedValue(25_000_000);

    render(<AdminPage />);

    await waitFor(() =>
      expect(screen.getByText("Platform Fees")).toBeInTheDocument(),
    );
    // Value formatted to 2dp, with the XLM unit and the 2.5% descriptor.
    expect(screen.getByText("2.50")).toBeInTheDocument();
    expect(screen.getByText("XLM")).toBeInTheDocument();
    expect(
      screen.getByText(/Accrued platform fees \(2\.5%\)/i),
    ).toBeInTheDocument();
  });

  it("handles a zero / missing fee config without crashing", async () => {
    mockGetFees.mockResolvedValue(0);

    render(<AdminPage />);

    await waitFor(() =>
      expect(screen.getByText("Platform Fees")).toBeInTheDocument(),
    );
    // Zero renders as a formatted "0.00" rather than blank/NaN/crash.
    expect(screen.getByText("0.00")).toBeInTheDocument();
    // Nothing to withdraw → the action is disabled.
    const withdraw = screen.getByRole("button", { name: /withdraw fees/i });
    expect(withdraw).toBeDisabled();
  });

  it("reflects updated fee values when admin data changes", async () => {
    // First fetch: 1.00 XLM.
    mockGetFees.mockResolvedValue(10_000_000);
    const { rerender } = render(<AdminPage />);

    await waitFor(() => expect(screen.getByText("1.00")).toBeInTheDocument());

    // Admin data changes underneath (fees grew to 5.00 XLM); a new wallet
    // identity re-triggers the fetch effect, re-reading getFees.
    mockGetFees.mockResolvedValue(50_000_000);
    mockWallet = "GADMINWALLET2";
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = "GADMINWALLET2";
    rerender(<AdminPage />);

    await waitFor(() => expect(screen.getByText("5.00")).toBeInTheDocument());
    expect(screen.queryByText("1.00")).not.toBeInTheDocument();
  });
});
