import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EarningsEstimatorPage, {
  EarningsCard,
  calculateEarnings,
  formatCurrency,
  type Scenario,
} from "@/app/earnings-estimator/page";

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
  });

  it("renders the calculator with default values", () => {
    render(<EarningsEstimatorPage />);
    expect(screen.getByText("Earnings Estimator")).toBeInTheDocument();
    expect(screen.getByText("Calculator")).toBeInTheDocument();
    expect(screen.getByText("Compare Scenarios")).toBeInTheDocument();
  });

  it("shows current scenario earnings card", () => {
    render(<EarningsEstimatorPage />);
    expect(screen.getByText("Monthly Gross")).toBeInTheDocument();
    const feeLabels = screen.getAllByText(/Platform Fees/i);
    expect(feeLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Net Earnings")).toBeInTheDocument();
    expect(screen.getByText("Hourly Rate")).toBeInTheDocument();
    expect(screen.getByText("Annual Projection")).toBeInTheDocument();
  });

  it("allows changing input values", () => {
    render(<EarningsEstimatorPage />);
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    const jobAmountInput = inputs[0];
    fireEvent.change(jobAmountInput, { target: { value: "500" } });
    expect(jobAmountInput.value).toBe("500");
  });

  it("allows changing currency", () => {
    render(<EarningsEstimatorPage />);
    fireEvent.click(screen.getByRole("button", { name: "$ USD" }));
  });

  it("allows saving and viewing scenarios", () => {
    render(<EarningsEstimatorPage />);
    const input = screen.getByPlaceholderText("Scenario label...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "My Scenario" } });
    fireEvent.click(screen.getByText("Save Scenario"));
    expect(screen.getByText("My Scenario")).toBeInTheDocument();
  });

  it("allows removing saved scenarios", () => {
    render(<EarningsEstimatorPage />);
    const input = screen.getByPlaceholderText("Scenario label...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Remove Me" } });
    fireEvent.click(screen.getByText("Save Scenario"));
    expect(screen.getByText("Remove Me")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete Remove Me/i }));
    expect(screen.queryByText("Remove Me")).not.toBeInTheDocument();
  });

  describe("zero-gross and financial boundary states (#1191)", () => {
    it("renders a defined zero-gross breakdown with finite 0% widths when amount input is cleared", () => {
      render(<EarningsEstimatorPage />);
      const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
      const jobAmountInput = inputs[0];

      fireEvent.change(jobAmountInput, { target: { value: "" } });

      const netBar = screen.getByTestId("breakdown-net-bar");
      const feeBar = screen.getByTestId("breakdown-fee-bar");
      const breakdownBar = screen.getByTestId("earnings-breakdown-bar");

      expect(netBar.getAttribute("style")).toContain("width: 0%");
      expect(netBar.getAttribute("style")).not.toContain("NaN");
      expect(feeBar.getAttribute("style")).toContain("width: 0%");
      expect(feeBar.getAttribute("style")).not.toContain("NaN");
      expect(breakdownBar).toHaveAttribute("data-zero-gross", "true");
      expect(screen.getByTestId("zero-gross-state")).toBeInTheDocument();
      expect(screen.getAllByText("\u20BF0.00").length).toBeGreaterThanOrEqual(4);
    });

    it("renders finite 0% widths and readable zero totals when job amount is explicitly 0", () => {
      render(<EarningsEstimatorPage />);
      const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
      fireEvent.change(inputs[0], { target: { value: "0" } });

      const netBar = screen.getByTestId("breakdown-net-bar");
      const feeBar = screen.getByTestId("breakdown-fee-bar");

      expect(netBar).toHaveStyle({ width: "0%" });
      expect(feeBar).toHaveStyle({ width: "0%" });
      expect(screen.getByTestId("zero-gross-state")).toHaveTextContent(
        /no gross earnings to break down/i,
      );
    });

    it("renders 100% net width and 0% fee width when platform fee is 0 bps", () => {
      render(<EarningsEstimatorPage />);
      const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
      const feeInput = inputs[2];

      fireEvent.change(feeInput, { target: { value: "0" } });

      const netBar = screen.getByTestId("breakdown-net-bar");
      const feeBar = screen.getByTestId("breakdown-fee-bar");

      expect(netBar).toHaveStyle({ width: "100%" });
      expect(feeBar).toHaveStyle({ width: "0%" });
      expect(screen.queryByTestId("zero-gross-state")).not.toBeInTheDocument();
      expect(screen.getByText(/Net \(100\.0%\)/)).toBeInTheDocument();
      expect(screen.getByText(/Fees \(0\.0%\)/)).toBeInTheDocument();
    });

    it("renders 0% net width and 100% fee width when platform fee is 10000 bps (full fee)", () => {
      render(<EarningsEstimatorPage />);
      const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
      const feeInput = inputs[2];

      fireEvent.change(feeInput, { target: { value: "10000" } });

      const netBar = screen.getByTestId("breakdown-net-bar");
      const feeBar = screen.getByTestId("breakdown-fee-bar");

      expect(netBar).toHaveStyle({ width: "0%" });
      expect(feeBar).toHaveStyle({ width: "100%" });
      expect(screen.queryByTestId("zero-gross-state")).not.toBeInTheDocument();
      expect(screen.getByText(/Net \(0\.0%\)/)).toBeInTheDocument();
      expect(screen.getByText(/Fees \(100\.0%\)/)).toBeInTheDocument();
    });

    it("rejects negative input values in the calculator with a warning and clamps to zero-gross", () => {
      render(<EarningsEstimatorPage />);
      const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];

      fireEvent.change(inputs[0], { target: { value: "-250" } });

      expect(screen.getByTestId("calculator-input-warning")).toHaveTextContent(
        /negative or non-finite financial values are not allowed/i,
      );
      expect(screen.getByTestId("breakdown-net-bar")).toHaveStyle({ width: "0%" });
      expect(screen.getByTestId("breakdown-fee-bar")).toHaveStyle({ width: "0%" });
      expect(screen.getByTestId("zero-gross-state")).toBeInTheDocument();
    });

    it("handles negative and non-finite scenario fields in EarningsCard and calculateEarnings without NaN or Infinity", () => {
      const malformedScenario: Scenario = {
        id: "bad-1",
        label: "Malformed Scenario",
        jobAmount: Number.NaN,
        jobsPerMonth: -5,
        platformFeeBps: Number.POSITIVE_INFINITY,
        hoursPerJob: -10,
      };

      const breakdown = calculateEarnings(malformedScenario);
      expect(breakdown.hasInvalidInput).toBe(true);
      expect(breakdown.isZeroGross).toBe(true);
      expect(Number.isFinite(breakdown.netWidthPct)).toBe(true);
      expect(Number.isFinite(breakdown.feeWidthPct)).toBe(true);
      expect(breakdown.netWidthPct).toBe(0);
      expect(breakdown.feeWidthPct).toBe(0);

      render(<EarningsCard scenario={malformedScenario} currency="USD" />);
      expect(screen.getByTestId("invalid-financial-input-notice")).toBeInTheDocument();
      expect(screen.getByTestId("zero-gross-state")).toBeInTheDocument();
      expect(formatCurrency(Number.NaN, "USD")).toBe("$0.00");
      expect(formatCurrency(Number.POSITIVE_INFINITY, "EUR")).toBe("\u20AC0.00");
      expect(formatCurrency(-99, "XLM")).toBe("\u20BF0.00");
    });
  });
});
