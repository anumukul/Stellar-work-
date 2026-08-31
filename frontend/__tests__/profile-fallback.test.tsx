import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProfilePageClient from "@/app/profile/[address]/profile-page-client";

// Mock Next.js Link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/StatusPill", () => ({
  default: ({ status }: { status: string }) => <span>{status}</span>,
}));

// Mock wallet context
const mockConnectWallet = vi.fn();
const mockWalletContext = {
  wallet: null as string | null,
  connectWallet: mockConnectWallet,
};

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => mockWalletContext,
}));

// Mock contract functions
vi.mock("@/lib/contract", () => ({
  getJob: vi.fn(),
  getJobCount: vi.fn().mockResolvedValue(0),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

// Mock format utilities
vi.mock("@/lib/format", () => ({
  toXlm: (value: bigint | string) => `${Number(value) / 10000000}`,
}));

describe("Profile Route Fallback Handling", () => {
  it("shows invalid address fallback with back navigation", () => {
    const invalidAddress = "INVALID123";
    render(<ProfilePageClient address={invalidAddress} />);

    // Check for invalid address message
    expect(screen.getByText("Invalid Address")).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${invalidAddress}.*valid Stellar address`)),
    ).toBeInTheDocument();
    
    // Check for helpful hint
    expect(
      screen.getByText(/Stellar addresses start with .*G.*56 characters long/),
    ).toBeInTheDocument();

    // Check for back navigation
    const backLink = screen.getByRole("link", { name: /Back to Home/ });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("renders a public profile with back navigation when not connected", async () => {
    const validAddress = "GABC7DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV";
    mockWalletContext.wallet = null;
    
    render(<ProfilePageClient address={validAddress} />);

    expect(await screen.findByText(validAddress)).toBeInTheDocument();
    expect(screen.queryByText("Connect your wallet to view this profile.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Portfolio/ })).not.toBeInTheDocument();

    // Check for back navigation
    const backLink = screen.getByRole("link", { name: /Back to Home/ });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("does not throw runtime errors for invalid addresses", () => {
    const invalidAddresses = [
      "",
      "X",
      "GABC",
      "gabc7defghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuv",
      "HABC7DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV",
      "GABC7DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTU", // 55 chars
      "GABC7DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW", // 57 chars
    ];

    for (const address of invalidAddresses) {
      const { unmount } = render(<ProfilePageClient address={address} />);
      
      // Should render without errors
      expect(screen.getByText("Invalid Address")).toBeInTheDocument();
      
      // Should have back navigation
      expect(screen.getByRole("link", { name: /Back to Home/ })).toBeInTheDocument();
      
      unmount();
    }
  });

  it("renders valid profile page with back navigation when wallet connected", async () => {
    const validAddress = "GABC7DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV";
    mockWalletContext.wallet = "GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGH";
    
    render(<ProfilePageClient address={validAddress} />);

    // Wait for profile to load
    await screen.findByText("Profile");

    // Check address is displayed
    expect(screen.getByText(validAddress)).toBeInTheDocument();

    // Check for back navigation
    const backLink = screen.getByRole("link", { name: /Back to Home/ });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("validates Stellar address format correctly", () => {
    // Valid addresses (start with G, 56 chars, uppercase alphanumeric)
    const validAddresses = [
      "GABC7DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV",
      "G234567ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQ",
    ];

    for (const address of validAddresses) {
      mockWalletContext.wallet = null;
      const { unmount } = render(<ProfilePageClient address={address} />);
      
      // Should show the public profile, not invalid address or a wallet gate
      expect(screen.getByText(address)).toBeInTheDocument();
      expect(screen.queryByText("Invalid Address")).not.toBeInTheDocument();
      expect(screen.queryByText("Connect your wallet to view this profile.")).not.toBeInTheDocument();
      
      unmount();
    }
  });
});
