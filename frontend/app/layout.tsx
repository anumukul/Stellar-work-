import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import dynamic from "next/dynamic";
import Link from "next/link";
import { WalletProvider } from "@/lib/wallet-context";
import { ToastProvider } from "@/components/ToastProvider";
import { NotificationProvider } from "@/lib/notifications-context";
import { MessagingProvider } from "@/lib/messaging-context";
import { MeetingsProvider } from "@/lib/meetings-context";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TypographyProvider } from "@/lib/typography-context";
import { NetworkProvider } from "@/lib/network-context";
import { Navigation } from "./navigation";
import { ScrollRestorer } from "@/components/ScrollRestorer";
import ErrorBoundary from "@/components/ErrorBoundary";
import JsonLd from "@/components/JsonLd";
import AppFooter from "@/components/AppFooter";
import OfflineIndicator from "@/components/OfflineIndicator";
import WalletNetworkWarning from "@/components/WalletNetworkWarning";
import DeferredClientFeatures from "@/components/DeferredClientFeatures";
import { ClientProviders } from "./client-providers";
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
    types: {
      "application/rss+xml": "/feed.xml",
    },
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
            <TypographyProvider>
              <NetworkProvider>
                <WalletProvider>
                  <NotificationProvider>
                    <MessagingProvider>
                      <MeetingsProvider>
                        <ToastProvider>

        <ThemeProvider>
        <TypographyProvider>
        <NetworkProvider>
        <WalletProvider>
          <NotificationProvider>
          <MessagingProvider>
          <MeetingsProvider>
          <ToastProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900 focus:outline-none dark:focus:bg-slate-800 dark:focus:text-slate-100"
          >
            Skip to main content
          </a>
          <DeferredClientFeatures />
          <ClientProviders>
          <OfflineIndicator />
          <WalletNetworkWarning />
          <Navigation />
          <ScrollRestorer />
          <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-4 sm:py-8 lg:ml-[220px]">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
          <footer className="mt-auto border-t border-slate-200 bg-white py-8">
            <div className="mx-auto max-w-5xl px-4">
              <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
                <div className="flex flex-col items-center gap-2 md:items-start">
                  <span className="text-lg font-bold text-slate-900">StellarWork</span>
                  <p className="text-sm text-slate-500">Decentralized Escrow Marketplace</p>
                </div>

                <nav className="flex flex-wrap justify-center gap-8 text-sm font-medium text-slate-600">
                  <a href="https://github.com/anumukul/Stellar-work-" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">GitHub</a>
                  <Link href="/docs" className="hover:text-blue-600 transition-colors">Documentation</Link>
                  <a href="/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">License</a>
                  <Link href="/legal/terms" className="hover:text-blue-600 transition-colors">Terms</Link>
                  <Link href="/legal/privacy" className="hover:text-blue-600 transition-colors">Privacy</Link>
                </nav>

                <div className="flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 border border-slate-100">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Built on</span>
                  <span className="text-sm font-bold text-slate-800">Stellar</span>
                </div>
              </div>
              <div className="mt-8 border-t border-slate-100 pt-8 text-center text-xs text-slate-400">
                &copy; {new Date().getFullYear()} StellarWork. All rights reserved.
              </div>
            </div>
          </footer>
          <AppFooter />
                        </ToastProvider>
                      </MeetingsProvider>
                    </MessagingProvider>
                  </NotificationProvider>
                </WalletProvider>
              </NetworkProvider>
            </TypographyProvider>
          </ThemeProvider>
          </ClientProviders>
          </ToastProvider>
          </MeetingsProvider>
          </MessagingProvider>
          </NotificationProvider>
        </WalletProvider>
        </NetworkProvider>
        </TypographyProvider>
        </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
