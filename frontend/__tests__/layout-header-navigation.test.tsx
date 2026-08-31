import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Navigation } from "@/app/navigation";

const mockUseWallet = vi.fn();
const mockUsePathname = vi.fn();

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
    toString: vi.fn().mockReturnValue(""),
  }),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => mockUseWallet(),
  WalletButton: () => <button type="button">Connect Wallet</button>,
}));

vi.mock("@/components/NetworkBadge", () => ({
  default: () => <span data-testid="network-badge">testnet</span>,
}));

vi.mock("@/components/NotificationInbox", () => ({
  default: () => <div data-testid="notification-inbox" />,
}));

vi.mock("@/lib/messaging-context", () => ({
  useMessaging: () => ({ unreadCount: 0 }),
  MessagingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("Layout header navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    mockUsePathname.mockReturnValue("/");
  });

  it("renders the StellarWork brand link plus core navigation entries", () => {
    render(<Navigation />);

    // Brand link
    const brand = screen.getByRole("link", { name: "StellarWork" });
    expect(brand).toHaveAttribute("href", "/");

    // The "Jobs" link points at home and Dashboard is exposed.
    const nav = screen.getAllByRole("navigation", { name: "Main navigation" })[0];
    expect(within(nav).getByRole("link", { name: "Jobs" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(within(nav).getByRole("link", { name: "Post Job" })).toHaveAttribute(
      "href",
      "/post-job",
    );
    expect(within(nav).getByRole("link", { name: "Disputes" })).toHaveAttribute(
      "href",
      "/disputes",
    );
  });

  it("highlights the active route with semibold styling", () => {
    mockUsePathname.mockReturnValue("/dashboard");

    render(<Navigation />);

    const nav = screen.getAllByRole("navigation", { name: "Main navigation" })[0];
    const dashboardLink = within(nav).getByRole("link", { name: "Dashboard" });
    const jobsLink = within(nav).getByRole("link", { name: "Jobs" });

    expect(dashboardLink).toHaveClass("font-semibold", "text-slate-900");
    expect(jobsLink).not.toHaveClass("font-semibold");
  });

  it("marks the home link active only on the exact root path", () => {
    mockUsePathname.mockReturnValue("/disputes");

    render(<Navigation />);

    const nav = screen.getAllByRole("navigation", { name: "Main navigation" })[0];
    expect(within(nav).getByRole("link", { name: "Jobs" })).not.toHaveClass(
      "font-semibold",
    );
    expect(within(nav).getByRole("link", { name: "Disputes" })).toHaveClass(
      "font-semibold",
    );
  });

  it("toggles the mobile menu open and closed via the menu button", () => {
    render(<Navigation />);

    const toggle = screen.getByRole("button", { name: /Toggle navigation menu/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    // After opening, two navigation regions are present (desktop + mobile).
    const navs = screen.getAllByRole("navigation", { name: "Main navigation" });
    expect(navs.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("exposes the Profile link only when a wallet is connected", () => {
    const { rerender } = render(<Navigation />);

    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();

    mockUseWallet.mockReturnValue({
      wallet: "GWALLET000000000000000000000000000000000000000000000000000",
      connectWallet: vi.fn(),
    });
    // Navigation is memoized; a remount makes the mocked wallet take effect.
    rerender(<Navigation key="with-wallet" />);

    const nav = screen.getAllByRole("navigation", { name: "Main navigation" })[0];
    const profileLink = within(nav).getByRole("link", { name: "Profile" });
    expect(profileLink).toHaveAttribute(
      "href",
      "/profile/GWALLET000000000000000000000000000000000000000000000000000",
    );
  });
});
