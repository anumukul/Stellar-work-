import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EarningsEstimatorPage from "@/app/earnings-estimator/page";

const mockFetchXlmFiatRates = vi.fn();
const mockGetCachedXlmFiatRates = vi.fn();
const mockGetPlatformFeeRate = vi.fn();

vi.mock("@/lib/format", () => ({
  fetchXlmFiatRates: (...args: unknown[]) => mockFetchXlmFiatRates(...args),
  getCachedXlmFiatRates: (...args: unknown[]) => mockGetCachedXlmFiatRates(...args),
}));

vi.mock("@/lib/contract", () => ({
  getPlatformFeeRate: (...args: unknown[]) => mockGetPlatformFeeRate(...args),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => ({ wallet: null, connectWallet: vi.fn() }),
}));

vi.mock("@/lib/notifications-context", () => ({
  useNotifications: () => ({
    notifications: [],
    addNotification: vi.fn(),
  }),
}));

describe("EarningsEstimatorPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockGetCachedXlmFiatRates.mockReturnValue(null);
    mockFetchXlmFiatRates.mockResolvedValue({
      rates: { USD: 0.25, EUR: 0.2 },
      fetchedAt: 1700000000000,
    });
    mockGetPlatformFeeRate.mockResolvedValue(300);
  });

  it("renders the calculator with default values", async () => {
    render(<EarningsEstimatorPage />);
    expect(screen.getByText("Earnings Estimator")).toBeInTheDocument();
    expect(screen.getByText("Calculator")).toBeInTheDocument();
    expect(screen.getByText("Compare Scenarios")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockFetchXlmFiatRates).toHaveBeenCalled();
    });
  });

  it("shows current scenario earnings card", async () => {
    render(<EarningsEstimatorPage />);
    expect(screen.getByText("Monthly Gross")).toBeInTheDocument();
    const feeLabels = screen.getAllByText(/Platform Fees/i);
    expect(feeLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Net Earnings")).toBeInTheDocument();
    expect(screen.getByText("Hourly Rate")).toBeInTheDocument();
    expect(screen.getByText("Annual Projection")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockGetPlatformFeeRate).toHaveBeenCalled();
    });
  });

  it("allows changing input values", async () => {
    render(<EarningsEstimatorPage />);
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    const jobAmountInput = inputs[0];
    fireEvent.change(jobAmountInput, { target: { value: "500" } });
    expect(jobAmountInput.value).toBe("500");
    await waitFor(() => {
      expect(mockFetchXlmFiatRates).toHaveBeenCalled();
    });
  });

  it("allows changing currency", async () => {
    render(<EarningsEstimatorPage />);
    fireEvent.click(screen.getByRole("button", { name: "$ USD" }));
    await waitFor(() => {
      expect(mockFetchXlmFiatRates).toHaveBeenCalled();
    });
  });

  it("allows saving and viewing scenarios", async () => {
    render(<EarningsEstimatorPage />);
    const input = screen.getByPlaceholderText("Scenario label...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "My Scenario" } });
    fireEvent.click(screen.getByText("Save Scenario"));
    expect(screen.getByText("My Scenario")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockFetchXlmFiatRates).toHaveBeenCalled();
    });
  });

  it("allows removing saved scenarios", async () => {
    render(<EarningsEstimatorPage />);
    const input = screen.getByPlaceholderText("Scenario label...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Remove Me" } });
    fireEvent.click(screen.getByText("Save Scenario"));
    expect(screen.getByText("Remove Me")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete Remove Me/i }));
    expect(screen.queryByText("Remove Me")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockFetchXlmFiatRates).toHaveBeenCalled();
    });
  });

  it("loads live exchange rates and contract fee with visible timestamps", async () => {
    render(<EarningsEstimatorPage />);

    await waitFor(() => {
      expect(screen.getByTestId("exchange-rate-timestamp")).toBeInTheDocument();
      expect(screen.getByTestId("platform-fee-timestamp")).toBeInTheDocument();
    });

    expect(screen.getByTestId("exchange-rate-source")).toHaveTextContent(
      "Live (live): 1 XLM = $0.25 USD / €0.2 EUR",
    );
    expect(screen.getByTestId("platform-fee-source")).toHaveTextContent(
      "Live contract fee: 300 bps (3.00%)",
    );
    expect(screen.getByText("Platform Fees (3%)")).toBeInTheDocument();

    // Switch to USD: 200 XLM * 5 jobs = 1000 XLM gross * 0.25 USD/XLM = $250.00
    fireEvent.click(screen.getByRole("button", { name: "$ USD" }));
    expect(screen.getByText("$250.00")).toBeInTheDocument();
  });

  it("tracks explicit user fee override and allows resetting back to the live contract fee", async () => {
    render(<EarningsEstimatorPage />);

    await waitFor(() => {
      expect(screen.getByText("Platform Fees (3%)")).toBeInTheDocument();
    });

    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    const feeInput = inputs[2];
    expect(feeInput.value).toBe("300");

    fireEvent.change(feeInput, { target: { value: "500" } });
    expect(feeInput.value).toBe("500");
    expect(screen.getByTestId("fee-override-badge")).toHaveTextContent("User override");
    expect(screen.getByText("Platform Fees (5%)")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("reset-fee-override"));
    expect(screen.queryByTestId("fee-override-badge")).not.toBeInTheDocument();
    expect(feeInput.value).toBe("300");
    expect(screen.getByText("Platform Fees (3%)")).toBeInTheDocument();
  });

  it("labels fallback rates and fees as estimates during rate and contract outages", async () => {
    mockFetchXlmFiatRates.mockRejectedValueOnce(new Error("Rate API down"));
    mockGetPlatformFeeRate.mockResolvedValueOnce(null);

    render(<EarningsEstimatorPage />);

    await waitFor(() => {
      expect(screen.getByTestId("exchange-rate-fallback-badge")).toBeInTheDocument();
      expect(screen.getByTestId("platform-fee-fallback-badge")).toBeInTheDocument();
    });

    expect(screen.getByTestId("exchange-rate-fallback-badge")).toHaveTextContent(
      "Fallback estimate (rate feed unavailable): 1 XLM ≈ $0.12 USD / €0.11 EUR",
    );
    expect(screen.getByTestId("platform-fee-fallback-badge")).toHaveTextContent(
      "Fallback estimate (contract fee unavailable): 250 bps (2.50%)",
    );
    expect(screen.queryByTestId("exchange-rate-timestamp")).not.toBeInTheDocument();
    expect(screen.queryByTestId("platform-fee-timestamp")).not.toBeInTheDocument();

    // Switching to USD shows explicit fallback estimate badge on the card
    fireEvent.click(screen.getByRole("button", { name: "$ USD" }));
    expect(screen.getByTestId("card-fallback-rate-estimate")).toHaveTextContent(
      "Est. (fallback USD rate)",
    );
  });
});
