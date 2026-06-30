import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { WalletProvider } from "@/lib/wallet-context";
import { ToastProvider } from "@/components/ToastProvider";
import { NotificationProvider } from "@/lib/notifications-context";
import { MessagingProvider } from "@/lib/messaging-context";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Navigation } from "./navigation";
import { ScrollRestorer } from "@/components/ScrollRestorer";
import ErrorBoundary from "@/components/ErrorBoundary";
import CommandPalette from "@/components/CommandPalette";
import ShortcutCheatSheet from "@/components/ShortcutCheatSheet";
import OnboardingProvider from "@/components/OnboardingProvider";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import JsonLd from "@/components/JsonLd";
import AppFooter from "@/components/AppFooter";
import OfflineIndicator from "@/components/OfflineIndicator";
import InstallPrompt from "@/components/InstallPrompt";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://stellarwork.app";

export const metadata: Metadata = {
    metadataBase: new URL(BASE_URL),
  title: {
    default: "StellarWork — Decentralized Freelance Marketplace on Stellar",
    template: "%s | StellarWork",
  },
  description:
    "StellarWork is a decentralized escrow freelance marketplace built on Stellar. Find jobs, hire talent, and get paid trustlessly with smart-contract escrow.",
  keywords: [
    "freelance",
    "Stellar",
    "blockchain",
    "escrow",
    "decentralized",
    "crypto jobs",
    "smart contracts",
    "Web3 freelance",
  ],
  authors: [{ name: "StellarWork" }],
  creator: "StellarWork",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "StellarWork",
    title: "StellarWork — Decentralized Freelance Marketplace on Stellar",
    description:
      "Hire or work as a freelancer with trustless smart-contract escrow on the Stellar network.",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "StellarWork — Decentralized Freelance Marketplace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StellarWork — Decentralized Freelance Marketplace on Stellar",
    description:
      "Hire or work as a freelancer with trustless smart-contract escrow on the Stellar network.",
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "StellarWork",
            url: BASE_URL,
            description:
              "Decentralized escrow freelance marketplace built on the Stellar network.",
            potentialAction: {
              "@type": "SearchAction",
              target: `${BASE_URL}/?q={search_term_string}`,
              "query-input": "required name=search_term_string",
            },
          }}
        />
        <NextIntlClientProvider messages={messages} locale={locale}>
        <ThemeProvider>
        <WalletProvider>
          <NotificationProvider>
          <MessagingProvider>
          <ToastProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900 focus:outline-none dark:focus:bg-slate-800 dark:focus:text-slate-100"
          >
            Skip to main content
          </a>
          <ServiceWorkerRegistration />
          <AnnouncementBanner />
          <OfflineIndicator />
          <Navigation />
          <CommandPalette />
          <ShortcutCheatSheet />
          <OnboardingProvider />
          <ScrollRestorer />
          <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-4 sm:py-8">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
          <InstallPrompt />
          <AppFooter />
          </ToastProvider>
          </MessagingProvider>
          </NotificationProvider>
        </WalletProvider>
        </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
