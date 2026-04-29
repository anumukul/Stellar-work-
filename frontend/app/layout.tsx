import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { WalletProvider } from "@/lib/wallet-context";
import { Navigation } from "./navigation";
import { ScrollRestorer } from "@/components/ScrollRestorer";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StellarWork",
  description: "Decentralized escrow freelance marketplace on Stellar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <WalletProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900 focus:outline-none"
          >
            Skip to main content
          </a>
          <Navigation />
          <ScrollRestorer />
          <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
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
        </WalletProvider>
      </body>
    </html>
  );
}
