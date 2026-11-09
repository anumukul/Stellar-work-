import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Synchronously resolve next/dynamic imports so all client features mount immediately in tests
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default?: React.ComponentType<any> } | React.ComponentType<any>>) => {
    let LoadedComponent: React.ComponentType<any> | null = null;
    const promise = loader();
    if (promise && typeof (promise as Promise<any>).then === "function") {
      void (promise as Promise<any>).then((mod) => {
        LoadedComponent = mod?.default ?? mod;
      });
    }
    return function DynamicWrapper(props: Record<string, unknown>) {
      const [, forceRender] = React.useState(0);
      React.useEffect(() => {
        if (!LoadedComponent) {
          void (loader() as Promise<any>).then((mod) => {
            LoadedComponent = mod?.default ?? mod;
            forceRender((n) => n + 1);
          });
        }
      }, []);
      return LoadedComponent ? <LoadedComponent {...props} /> : null;
    };
  },
}));

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("en"),
  getMessages: vi.fn().mockResolvedValue({}),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => "",
  }),
}));

vi.mock("@/lib/wallet-context", () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWallet: () => ({ wallet: null, connectWallet: vi.fn() }),
  WalletButton: () => <button type="button">Connect Wallet</button>,
}));

vi.mock("@/lib/notifications-context", () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useNotifications: () => ({ notifications: [], unreadCount: 0 }),
}));

vi.mock("@/lib/messaging-context", () => ({
  MessagingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessaging: () => ({ unreadCount: 0 }),
}));

vi.mock("@/lib/meetings-context", () => ({
  MeetingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/lib/typography-context", () => ({
  TypographyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/network-context", () => ({
  NetworkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ErrorBoundary", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ToastProvider", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/app/navigation", () => ({
  Navigation: () => <nav aria-label="Main navigation">Nav</nav>,
}));

vi.mock("@/components/ScrollRestorer", () => ({
  ScrollRestorer: () => null,
}));

vi.mock("@/components/OfflineIndicator", () => ({
  default: () => null,
}));

vi.mock("@/components/pwa-install-prompt", () => ({
  PWAInstallPrompt: () => null,
}));

vi.mock("@/components/WalletNetworkWarning", () => ({
  default: () => null,
}));

vi.mock("@/components/AppFooter", () => ({
  default: () => null,
}));

const mockReportSample = vi.fn();
vi.mock("@/lib/metrics-client", () => ({
  reportSample: (...args: unknown[]) => mockReportSample(...args),
  flushMetrics: vi.fn(),
}));

import RootLayout from "@/app/layout";
import { ClientProviders } from "@/app/client-providers";
import { ANNOUNCEMENT_STORAGE_KEY } from "@/components/AnnouncementBanner";

describe("Root layout global client features single-mount boundary (BUG-43 / #1178)", () => {
  const registerMock = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: registerMock },
      configurable: true,
    });
  });

  it("mounts each shared global client feature, Sidebar, and MetricsReporter exactly once in RootLayout", async () => {
    localStorage.setItem(
      ANNOUNCEMENT_STORAGE_KEY,
      JSON.stringify({
        id: "ann-1",
        type: "info",
        message: "Platform maintenance scheduled",
        enabled: true,
        expiresAt: null,
      }),
    );

    const layoutElement = await RootLayout({
      children: <div data-testid="page-child">Child Content</div>,
    });

    await act(async () => {
      render(layoutElement);
    });

    // 1. ServiceWorkerRegistration effect runs once
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith("/sw.js");

    // 2. AnnouncementBanner renders once
    expect(screen.getAllByText("Platform maintenance scheduled")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Dismiss announcement" })).toHaveLength(1);

    // 3. OnboardingProvider renders one tour button and one onboarding wizard dialog
    expect(screen.getAllByRole("button", { name: "Open onboarding tour" })).toHaveLength(1);
    expect(screen.getAllByRole("dialog", { name: "Onboarding wizard" })).toHaveLength(1);

    // 4. Sidebar renders once
    expect(screen.getAllByRole("navigation", { name: "Sidebar navigation" })).toHaveLength(1);

    // 5. MetricsReporter reports initial page_view once
    const pageViewCalls = mockReportSample.mock.calls.filter(
      ([sample]) => sample?.type === "page_view",
    );
    expect(pageViewCalls).toHaveLength(1);

    // 6. CommandPalette opens a single instance on Ctrl+K
    await act(async () => {
      fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    });
    expect(screen.getAllByRole("dialog", { name: "Command palette" })).toHaveLength(1);

    // 7. ShortcutCheatSheet opens a single instance on '?'
    await act(async () => {
      fireEvent.keyDown(window, { key: "?" });
    });
    expect(screen.getAllByRole("dialog", { name: /Keyboard shortcuts/i })).toHaveLength(1);
  });

  it("mounts InstallPrompt once when beforeinstallprompt fires inside ClientProviders", async () => {
    await act(async () => {
      render(
        <ClientProviders>
          <div>App Content</div>
        </ClientProviders>,
      );
    });

    await act(async () => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: "accepted" as const }),
      });
      window.dispatchEvent(event);
    });

    expect(
      screen.getAllByText("Install StellarWork for a better experience"),
    ).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Install" })).toHaveLength(1);
  });
});
