import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TransactionPreview, {
  type SimulationResult,
} from "@/components/TransactionPreview";

describe("TransactionPreview", () => {
  const baseSimulation: SimulationResult = {
    fee: "0.0012",
    stateChanges: ["Job #42 will be created in Open status"],
    balanceBefore: "1000",
    balanceAfter: "499.95",
    simulatedAt: Date.now(),
  };

  it("renders operation and details", () => {
    render(
      <TransactionPreview
        operation="Post job"
        details="500 XLM escrow + 0.05 XLM fee"
        simulation={null}
        simulating={false}
      />,
    );
    expect(screen.getByText("Post job")).toBeInTheDocument();
    expect(screen.getByText("500 XLM escrow + 0.05 XLM fee")).toBeInTheDocument();
  });

  it("shows spinner when simulating", () => {
    render(
      <TransactionPreview
        operation="Post job"
        details="test"
        simulation={null}
        simulating={true}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("displays simulation results", () => {
    render(
      <TransactionPreview
        operation="Post job"
        details="test"
        simulation={baseSimulation}
        simulating={false}
      />,
    );
    expect(screen.getByText("0.0012 XLM")).toBeInTheDocument();
    expect(screen.getByText("Job #42 will be created in Open status")).toBeInTheDocument();
    expect(screen.getByText(/1000 → 499.95 XLM/)).toBeInTheDocument();
  });

  it("shows simulation error", () => {
    render(
      <TransactionPreview
        operation="Post job"
        details="test"
        simulation={null}
        simulating={false}
        simulationError="Insufficient balance"
      />,
    );
    expect(screen.getByText("Simulation failed")).toBeInTheDocument();
    expect(screen.getByText("Insufficient balance")).toBeInTheDocument();
  });

  it("shows warning for simulation error in result", () => {
    const simWithWarning: SimulationResult = {
      ...baseSimulation,
      error: "Large amount detected",
    };
    render(
      <TransactionPreview
        operation="Post job"
        details="test"
        simulation={simWithWarning}
        simulating={false}
      />,
    );
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Large amount detected")).toBeInTheDocument();
  });

  it("toggles raw XDR visibility", async () => {
    const simWithXdr: SimulationResult = {
      ...baseSimulation,
      rawXdr: "AAAAAgAAAAB...",
    };
    render(
      <TransactionPreview
        operation="Post job"
        details="test"
        simulation={simWithXdr}
        simulating={false}
      />,
    );
    const toggleBtn = screen.getByText("Show raw XDR");
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.queryByText("AAAAAgAAAAB...")).not.toBeInTheDocument();
  });

  it("shows the estimated fee in fiat when available", () => {
    render(
      <TransactionPreview
        operation="Post job"
        details="test"
        simulation={{ ...baseSimulation, feeUsd: "$0.31" }}
        simulating={false}
      />,
    );
    expect(screen.getByText(/\(~\$0\.31\)/)).toBeInTheDocument();
  });

  it("shows the base + computation fee breakdown", () => {
    render(
      <TransactionPreview
        operation="Post job"
        details="test"
        simulation={{
          ...baseSimulation,
          feeBreakdown: {
            baseFeeXlm: "0.0000100",
            computationFeeXlm: "0.0011900",
            totalFeeXlm: "0.0012000",
          },
        }}
        simulating={false}
      />,
    );
    expect(screen.getByText("Fee breakdown")).toBeInTheDocument();
    expect(screen.getByText("Base fee")).toBeInTheDocument();
    expect(screen.getByText("Computation fee")).toBeInTheDocument();
    expect(screen.getByText("0.0011900 XLM")).toBeInTheDocument();
    expect(screen.getByText("0.0012000 XLM")).toBeInTheDocument();
  });

  it("compares the estimate against recent transactions", () => {
    render(
      <TransactionPreview
        operation="Post job"
        details="test"
        simulation={{
          ...baseSimulation,
          recentComparison: {
            count: 5,
            averageFeeXlm: "0.0006000",
            ratioToAverage: 2,
          },
        }}
        simulating={false}
      />,
    );
    expect(screen.getByText(/vs\. 5 recent transactions/)).toBeInTheDocument();
    expect(screen.getByText(/avg 0\.0006000 XLM/)).toBeInTheDocument();
    expect(screen.getByText(/\+100% vs avg/)).toBeInTheDocument();
  });

  it("warns on unusually high fee estimates", () => {
    render(
      <TransactionPreview
        operation="Post job"
        details="test"
        simulation={{
          ...baseSimulation,
          highFeeWarning:
            "This transaction's estimated fee is 200% higher than your recent average.",
        }}
        simulating={false}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Unusually high fee estimate")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This transaction's estimated fee is 200% higher than your recent average.",
      ),
    ).toBeInTheDocument();
  });

  it("hides the simulation-required note when submission is allowed without it", () => {
    render(
      <TransactionPreview
        operation="Post job"
        details="test"
        simulation={null}
        simulating={false}
        simulationError="Simulation failed"
        allowSubmitWithoutSimulation
      />,
    );
    expect(
      screen.queryByText("Confirm is disabled until simulation succeeds."),
    ).not.toBeInTheDocument();
  });
});
