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
});
