/**
 * Tests for the OnboardingWizard component (issue #413).
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OnboardingWizard from "@/components/OnboardingWizard";

beforeEach(() => {
  localStorage.clear();
});

describe("OnboardingWizard", () => {
  it("auto-shows on first visit (no localStorage flag)", () => {
    render(<OnboardingWizard />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not show when onboarding is already complete", () => {
    localStorage.setItem("stellarwork:onboarding-complete", "1");
    render(<OnboardingWizard />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows when forceOpen is true even if complete flag is set", () => {
    localStorage.setItem("stellarwork:onboarding-complete", "1");
    render(<OnboardingWizard forceOpen />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders step 1 of 6 on open", () => {
    render(<OnboardingWizard forceOpen />);
    expect(screen.getByText(/step 1 of 6/i)).toBeInTheDocument();
    expect(screen.getByText(/welcome to stellarwork/i)).toBeInTheDocument();
  });

  it("advances to next step on Next click", () => {
    render(<OnboardingWizard forceOpen />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/step 2 of 6/i)).toBeInTheDocument();
    expect(screen.getByText(/install freighter wallet/i)).toBeInTheDocument();
  });

  it("goes back to previous step on Back click", () => {
    render(<OnboardingWizard forceOpen />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText(/step 1 of 6/i)).toBeInTheDocument();
  });

  it("shows Get started on the last step", () => {
    render(<OnboardingWizard forceOpen />);
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
    }
    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByText(/step 6 of 6/i)).toBeInTheDocument();
  });

  it("closes and sets localStorage flag on Get started", () => {
    render(<OnboardingWizard forceOpen />);
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
    }
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("stellarwork:onboarding-complete")).toBe("1");
  });

  it("closes on Skip tour and sets dismissed flag", () => {
    render(<OnboardingWizard forceOpen />);
    fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("stellarwork:onboarding-dismissed")).toBe("1");
  });

  it("calls onClose callback when closed", () => {
    const onClose = vi.fn();
    render(<OnboardingWizard forceOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
