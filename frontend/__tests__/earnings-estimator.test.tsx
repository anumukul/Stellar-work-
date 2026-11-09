import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EarningsEstimatorPage, {
  SCENARIOS_KEY,
  SCENARIOS_SCHEMA_VERSION,
  MAX_SAVED_SCENARIOS,
  loadScenarios,
  loadScenariosWithMeta,
  validateScenarioRecord,
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

  it("allows saving and viewing scenarios in versioned envelope format", () => {
    render(<EarningsEstimatorPage />);
    const input = screen.getByPlaceholderText("Scenario label...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "My Scenario" } });
    fireEvent.click(screen.getByText("Save Scenario"));
    expect(screen.getByText("My Scenario")).toBeInTheDocument();

    const persisted = JSON.parse(localStorage.getItem(SCENARIOS_KEY)!);
    expect(persisted.version).toBe(SCENARIOS_SCHEMA_VERSION);
    expect(Array.isArray(persisted.scenarios)).toBe(true);
    expect(persisted.scenarios).toHaveLength(1);
    expect(persisted.scenarios[0].label).toBe("My Scenario");
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

  describe("FE-225 (#1188): Versioned scenario schema, migration, and malformed recovery", () => {
    it("recovers gracefully when localStorage contains a plain object in place of an array", () => {
      localStorage.setItem(
        SCENARIOS_KEY,
        JSON.stringify({ id: "bad", label: "Not an array", jobAmount: 100 }),
      );

      render(<EarningsEstimatorPage />);

      expect(screen.getByText(/No saved scenarios yet/i)).toBeInTheDocument();
      expect(screen.getByTestId("scenarios-recovery-notice")).toHaveTextContent(
        /Invalid saved scenario data was reset/i,
      );

      const persisted = JSON.parse(localStorage.getItem(SCENARIOS_KEY)!);
      expect(persisted).toEqual({
        version: SCENARIOS_SCHEMA_VERSION,
        scenarios: [],
      });
    });

    it("migrates valid legacy unversioned arrays and filters out null entries, missing labels, and nonfinite/out-of-range values", () => {
      // Create raw JSON with null entries, missing labels, NaN/Infinity/out-of-range numbers, and 1 valid legacy entry
      const rawJson = `[
        null,
        {"id":"missing-label","jobAmount":200,"jobsPerMonth":5,"platformFeeBps":250,"hoursPerJob":10},
        {"id":"empty-label","label":"   ","jobAmount":200,"jobsPerMonth":5,"platformFeeBps":250,"hoursPerJob":10},
        {"id":"negative-amount","label":"Negative Amount","jobAmount":-50,"jobsPerMonth":5,"platformFeeBps":250,"hoursPerJob":10},
        {"id":"excess-jobs","label":"Too Many Jobs","jobAmount":200,"jobsPerMonth":999,"platformFeeBps":250,"hoursPerJob":10},
        {"id":"string-num","label":"String Number","jobAmount":"200","jobsPerMonth":5,"platformFeeBps":250,"hoursPerJob":10},
        {"id":"valid-legacy","label":"Valid Legacy Scenario","jobAmount":350,"jobsPerMonth":4,"platformFeeBps":250,"hoursPerJob":8}
      ]`;
      localStorage.setItem(SCENARIOS_KEY, rawJson);

      render(<EarningsEstimatorPage />);

      expect(screen.getByText("Valid Legacy Scenario")).toBeInTheDocument();
      expect(screen.queryByText("Negative Amount")).not.toBeInTheDocument();
      expect(screen.queryByText("Too Many Jobs")).not.toBeInTheDocument();
      expect(screen.getByTestId("scenarios-recovery-notice")).toHaveTextContent(
        /Recovered 1 valid scenario\(s\) and skipped 6 invalid record\(s\)/i,
      );

      // Verify migrated storage is now versioned
      const persisted = JSON.parse(localStorage.getItem(SCENARIOS_KEY)!);
      expect(persisted.version).toBe(SCENARIOS_SCHEMA_VERSION);
      expect(persisted.scenarios).toHaveLength(1);
      expect(persisted.scenarios[0].id).toBe("valid-legacy");
    });

    it("rejects non-finite numeric values (NaN, Infinity, -Infinity) in validateScenarioRecord", () => {
      const base = {
        id: "s1",
        label: "Test Scenario",
        jobAmount: 100,
        jobsPerMonth: 5,
        platformFeeBps: 250,
        hoursPerJob: 10,
      };

      expect(validateScenarioRecord({ ...base, jobAmount: Number.NaN })).toBeNull();
      expect(
        validateScenarioRecord({ ...base, jobsPerMonth: Number.POSITIVE_INFINITY }),
      ).toBeNull();
      expect(
        validateScenarioRecord({ ...base, platformFeeBps: Number.NEGATIVE_INFINITY }),
      ).toBeNull();
      expect(validateScenarioRecord({ ...base, hoursPerJob: Number.NaN })).toBeNull();
      expect(validateScenarioRecord(null)).toBeNull();
      expect(validateScenarioRecord({ ...base, label: "" })).toBeNull();
    });

    it("enforces bounded record count (MAX_SAVED_SCENARIOS) and rejects unsupported schema versions", () => {
      const oversizedList = Array.from({ length: MAX_SAVED_SCENARIOS + 5 }, (_, i) => ({
        id: `scen-${i}`,
        label: `Scenario #${i + 1}`,
        jobAmount: 100 + i,
        jobsPerMonth: 5,
        platformFeeBps: 250,
        hoursPerJob: 10,
      }));
      localStorage.setItem(
        SCENARIOS_KEY,
        JSON.stringify({
          version: SCENARIOS_SCHEMA_VERSION,
          scenarios: oversizedList,
        }),
      );

      const loaded = loadScenariosWithMeta();
      expect(loaded.scenarios).toHaveLength(MAX_SAVED_SCENARIOS);
      expect(loaded.droppedCount).toBe(5);

      // Unsupported future version resets cleanly
      localStorage.setItem(
        SCENARIOS_KEY,
        JSON.stringify({
          version: 999,
          scenarios: oversizedList.slice(0, 2),
        }),
      );
      expect(loadScenarios()).toEqual([]);
    });
  });
});
