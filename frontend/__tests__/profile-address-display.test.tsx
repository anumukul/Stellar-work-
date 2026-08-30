import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ProfilePageClient from "@/app/profile/[address]/profile-page-client";
import { generateMetadata } from "@/app/profile/[address]/page";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockWalletContext = {
  wallet: null as string | null,
  connectWallet: vi.fn(),
};

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => mockWalletContext,
}));

vi.mock("@/lib/contract", () => ({
  getJob: vi.fn(),
  getJobCount: vi.fn().mockResolvedValue(0),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
  getCertificateCount: vi.fn().mockResolvedValue(0),
  getCertificates: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/format", () => ({
  toXlm: (value: bigint | string) => `${Number(value) / 10000000}`,
}));

const VALID_ADDRESS = "GABC7DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV";
const ANOTHER_VALID_ADDRESS =
  "GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ";

describe("Profile page address display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWalletContext.wallet = null;
  });

  it("renders the full Stellar address verbatim once the wallet is connected", async () => {
    mockWalletContext.wallet = ANOTHER_VALID_ADDRESS;

    render(<ProfilePageClient address={VALID_ADDRESS} />);

    // The address should be shown in full (no truncation), in a monospace block.
    const addressNode = await screen.findByText(VALID_ADDRESS);
    expect(addressNode).toBeInTheDocument();
    expect(addressNode).toHaveClass("font-mono");
    expect(addressNode.textContent?.length).toBe(56);
  });

  it("handles invalid address routes with a fallback message that echoes the input", () => {
    const invalidAddress = "NOT-A-VALID-ADDRESS";

    render(<ProfilePageClient address={invalidAddress} />);

    expect(screen.getByText("Invalid Address")).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${invalidAddress}.*not a valid Stellar address`)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Stellar addresses start with .*G.*56 characters long/),
    ).toBeInTheDocument();
  });

  it("does not render the on-chain address block on the invalid route", () => {
    render(<ProfilePageClient address="bogus" />);

    // The mono-font address paragraph used on the valid view must not appear.
    expect(screen.queryByText(/^G[A-Z2-7]{55}$/)).not.toBeInTheDocument();
  });

  it("includes the address in the page metadata title for valid addresses", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ address: VALID_ADDRESS }),
    });

    expect(metadata.title).toBe(`Profile | ${VALID_ADDRESS} | StellarWork`);
    expect(metadata.description).toContain(VALID_ADDRESS);
  });

  it("uses an explicit invalid-address metadata title when the route is malformed", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ address: "not-valid" }),
    });

    expect(metadata.title).toBe("Profile | Invalid Address | StellarWork");
    expect(metadata.description?.toLowerCase()).toContain("invalid");
  });
});
