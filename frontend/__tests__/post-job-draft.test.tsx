import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostJobPage from "@/app/post-job/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockPostJob = vi.fn();
const mockGetDescPayloadMax = vi.fn();

vi.mock("@/lib/contract", () => ({
  getDescPayloadMax: (...args: unknown[]) => mockGetDescPayloadMax(...args),
  postJob: (...args: unknown[]) => mockPostJob(...args),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

vi.mock("@/lib/ipfs-service", () => ({
  uploadToIpfs: vi.fn().mockResolvedValue("Qm123"),
  fetchFromIpfs: vi.fn(),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => ({
    wallet: "GWALLET000000000000000000000000000000000000000000000000000",
    connectWallet: vi.fn(),
  }),
}));

vi.mock("@/lib/stellar", () => ({
  getExplorerTxUrl: (hash: string) => `https://example.test/tx/${hash}`,
  isValidStellarAddress: (address: string) =>
    /^[GC][A-Z2-7]{55}$/.test(address.trim()),
  getCurrentOriginResult: () => ({ valid: true, origin: "http://localhost:3000" }),
  retryQueuedWrites: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
}));

const WALLET_DRAFT_KEY =
  "stellarwork:post-job-draft:GWALLET000000000000000000000000000000000000000000000000000";

describe("Post-job form: draft saving (FE-71 & BUG-46)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockGetDescPayloadMax.mockResolvedValue(4096);
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 'Clear draft' button when a draft is restored from localStorage", () => {
    localStorage.setItem(
      WALLET_DRAFT_KEY,
      JSON.stringify({
        amount: "5",
        description: "<p>Draft description</p>",
        deadline: "",
        tokenAddress: "GNATIVE",
        savedAt: Date.now(),
      }),
    );

    render(<PostJobPage />);

    expect(screen.getByText("Clear draft")).toBeInTheDocument();
  });

  it("clears draft and resets form (including bonusAmount) when 'Clear draft' is clicked", async () => {
    localStorage.setItem(
      WALLET_DRAFT_KEY,
      JSON.stringify({
        amount: "5",
        bonusAmount: "2.5",
        description: "<p>Draft description</p>",
        deadline: "",
        tokenAddress: "GNATIVE",
        savedAt: Date.now(),
      }),
    );

    render(<PostJobPage />);

    const bonusInput = screen.getByLabelText(/Bonus Amount \(XLM\)/i) as HTMLInputElement;
    expect(bonusInput.value).toBe("2.5");

    const clearBtn = screen.getByText("Clear draft");
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.queryByText("Clear draft")).not.toBeInTheDocument();
    });

    expect(localStorage.getItem(WALLET_DRAFT_KEY)).toBeNull();
    expect(bonusInput.value).toBe("");
  });

  it("does not show draft banner when no draft exists", () => {
    render(<PostJobPage />);
    expect(screen.queryByText("Clear draft")).not.toBeInTheDocument();
  });

  it("migrates older drafts missing bonusAmount to an empty default without crashing", () => {
    localStorage.setItem(
      WALLET_DRAFT_KEY,
      JSON.stringify({
        amount: "12.5",
        description: "<p>Legacy draft without bonusAmount</p>",
        deadline: "2027-01-01",
        tokenAddress: "GNATIVE",
        savedAt: Date.now(),
      }),
    );

    render(<PostJobPage />);

    const amountInput = screen.getByLabelText(/^Amount \(XLM\)/i) as HTMLInputElement;
    const bonusInput = screen.getByLabelText(/Bonus Amount \(XLM\)/i) as HTMLInputElement;
    expect(amountInput.value).toBe("12.5");
    expect(bonusInput.value).toBe("");
  });

  it("triggers autosave on bonus-only edits and restores bonusAmount across reloads", () => {
    vi.useFakeTimers();

    const { unmount } = render(<PostJobPage />);

    const bonusInput = screen.getByLabelText(/Bonus Amount \(XLM\)/i) as HTMLInputElement;
    fireEvent.change(bonusInput, { target: { value: "3.75" } });

    act(() => {
      vi.advanceTimersByTime(850);
    });

    const savedRaw = localStorage.getItem(WALLET_DRAFT_KEY);
    expect(savedRaw).not.toBeNull();
    const savedDraft = JSON.parse(savedRaw!);
    expect(savedDraft.bonusAmount).toBe("3.75");

    // Edit amount first, then perform a subsequent bonus-only edit and verify autosave updates bonusAmount
    const amountInput = screen.getByLabelText(/^Amount \(XLM\)/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "25" } });
    act(() => {
      vi.advanceTimersByTime(850);
    });

    fireEvent.change(bonusInput, { target: { value: "7.5" } });
    act(() => {
      vi.advanceTimersByTime(850);
    });

    const updatedDraft = JSON.parse(localStorage.getItem(WALLET_DRAFT_KEY)!);
    expect(updatedDraft.amount).toBe("25");
    expect(updatedDraft.bonusAmount).toBe("7.5");

    unmount();

    // Re-render to verify round-trip restoration
    render(<PostJobPage />);
    expect((screen.getByLabelText(/^Amount \(XLM\)/i) as HTMLInputElement).value).toBe("25");
    expect((screen.getByLabelText(/Bonus Amount \(XLM\)/i) as HTMLInputElement).value).toBe("7.5");
  });
});
