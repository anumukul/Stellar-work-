import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EarningsEstimatorPage, {
  SCENARIOS_KEY,
  saveScenarios,
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

function makeStorageError(name: "QuotaExceededError" | "SecurityError", message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

describe("EarningsEstimatorPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  describe("FE-226 (#1189): Persistence failure handling on save and delete", () => {
    it("keeps the newly saved scenario in memory and shows an actionable unsaved indicator on QuotaExceededError, then clears on Retry Save", () => {
      const setItemSpy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw makeStorageError("QuotaExceededError", "Storage quota exceeded");
        });

      render(<EarningsEstimatorPage />);

      const input = screen.getByPlaceholderText("Scenario label...") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Quota Test Scenario" } });
      fireEvent.click(screen.getByText("Save Scenario"));

      // In-memory edit is preserved and input is cleared without throwing
      expect(screen.getByText("Quota Test Scenario")).toBeInTheDocument();
      expect(input.value).toBe("");

      // Actionable unsaved indicator and badge are displayed
      expect(screen.getByTestId("unsaved-scenarios-badge")).toHaveTextContent(
        /Unsaved \(in-memory only\)/i,
      );
      const alert = screen.getByTestId("scenario-persistence-alert");
      expect(alert).toHaveTextContent(/QuotaExceededError/i);
      expect(alert).toHaveTextContent(/remain available in memory/i);

      // Export JSON action exposes the in-memory scenario payload
      fireEvent.click(screen.getByTestId("export-scenarios-json"));
      expect(screen.getByTestId("exported-scenarios-json")).toHaveTextContent(
        "Quota Test Scenario",
      );

      // Restore storage and click Retry Save -> persists and clears the unsaved indicator
      setItemSpy.mockRestore();
      fireEvent.click(screen.getByTestId("retry-persist-scenarios"));

      expect(screen.queryByTestId("scenario-persistence-alert")).not.toBeInTheDocument();
      expect(screen.queryByTestId("unsaved-scenarios-badge")).not.toBeInTheDocument();
      const persisted = JSON.parse(localStorage.getItem(SCENARIOS_KEY)!);
      expect(persisted).toHaveLength(1);
      expect(persisted[0].label).toBe("Quota Test Scenario");
    });

    it("keeps the in-memory scenario on SecurityError during save", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw makeStorageError("SecurityError", "The operation is insecure");
      });

      render(<EarningsEstimatorPage />);

      const input = screen.getByPlaceholderText("Scenario label...") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Security Blocked Scenario" } });
      fireEvent.click(screen.getByText("Save Scenario"));

      expect(screen.getByText("Security Blocked Scenario")).toBeInTheDocument();
      expect(screen.getByTestId("scenario-persistence-alert")).toHaveTextContent(
        /SecurityError/i,
      );
      expect(screen.getByTestId("unsaved-scenarios-badge")).toBeInTheDocument();
    });

    it("preserves the in-memory deletion and reports failure when deleteScenario encounters QuotaExceededError or SecurityError", () => {
      localStorage.setItem(
        SCENARIOS_KEY,
        JSON.stringify([
          {
            id: "s-1",
            label: "First Scenario",
            jobAmount: 200,
            jobsPerMonth: 5,
            platformFeeBps: 250,
            hoursPerJob: 10,
          },
          {
            id: "s-2",
            label: "Second Scenario",
            jobAmount: 400,
            jobsPerMonth: 3,
            platformFeeBps: 250,
            hoursPerJob: 8,
          },
        ]),
      );

      render(<EarningsEstimatorPage />);
      expect(screen.getByText("First Scenario")).toBeInTheDocument();
      expect(screen.getByText("Second Scenario")).toBeInTheDocument();

      // Simulate SecurityError when deleting First Scenario
      const setItemSpy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw makeStorageError("SecurityError", "Storage access denied");
        });

      fireEvent.click(screen.getByRole("button", { name: /Delete First Scenario/i }));

      // In-memory deletion succeeds
      expect(screen.queryByText("First Scenario")).not.toBeInTheDocument();
      expect(screen.getByText("Second Scenario")).toBeInTheDocument();
      expect(screen.getByTestId("scenario-persistence-alert")).toHaveTextContent(
        /SecurityError/i,
      );

      // Simulate QuotaExceededError when deleting Second Scenario
      setItemSpy.mockImplementation(() => {
        throw makeStorageError("QuotaExceededError", "Quota exceeded on delete");
      });

      fireEvent.click(screen.getByRole("button", { name: /Delete Second Scenario/i }));

      expect(screen.queryByText("Second Scenario")).not.toBeInTheDocument();
      expect(screen.getByTestId("scenario-persistence-alert")).toHaveTextContent(
        /QuotaExceededError/i,
      );

      // Direct unit check on saveScenarios helper
      const directResult = saveScenarios([]);
      expect(directResult.persisted).toBe(false);
      expect(directResult.errorType).toBe("QuotaExceededError");
    });
  });
});
