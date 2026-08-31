"use client";

import { useState } from "react";
import Link from "next/link";

interface AccordionItem {
  title: string;
  content: React.ReactNode;
}

export default function HelpClient() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleAccordion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const accordionItems: AccordionItem[] = [
    {
      title: "What is a Stellar wallet and how does it work?",
      content: (
        <div className="space-y-3 text-slate-600 dark:text-slate-400">
          <p>
            Unlike traditional bank accounts, a Stellar wallet does not actually store your funds. Instead, all assets (like XLM) and transactions are stored publicly on the <strong>Stellar ledger (blockchain)</strong>.
          </p>
          <p>
            Your wallet is a secure tool that manages your cryptographic keys:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Public Key (starts with &apos;G&apos;):</strong> Your account address. It is safe to share with anyone to receive payments.
            </li>
            <li>
              <strong>Secret Key (starts with &apos;S&apos;):</strong> Your digital signature. It is used to authorize all actions and must be kept strictly confidential.
            </li>
          </ul>
          <p>
            StellarWork is completely <strong>non-custodial</strong>. We never see, store, or transmit your secret keys.
          </p>
        </div>
      ),
    },
    {
      title: "Installing and setting up Freighter",
      content: (
        <div className="space-y-3 text-slate-600 dark:text-slate-400">
          <p>
            Freighter is the recommended browser extension wallet for interacting with StellarWork. It provides a secure environment to sign transactions.
          </p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              Go to the official website:{" "}
              <a
                href="https://www.freighter.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-semibold dark:text-blue-400"
              >
                freighter.app
              </a>{" "}
              and install the extension for your browser.
            </li>
            <li>Open the extension and click &quot;Create Wallet&quot;.</li>
            <li>Set a strong, unique password to unlock the extension on your device.</li>
            <li>Write down your 12-word recovery phrase and store it in a secure, physical location.</li>
          </ol>
        </div>
      ),
    },
    {
      title: "Backing up your secret key and recovery phrase",
      content: (
        <div className="space-y-3 text-slate-600 dark:text-slate-400">
          <p>
            Your 12-word recovery phrase is the master key to your entire Stellar account. If you lose it, you lose access to your funds.
          </p>
          <div className="rounded-lg bg-amber-50 p-4 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50">
            <h3 className="font-semibold text-amber-900 dark:text-amber-400 text-sm">Backup Checklist:</h3>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-300">
              <li>Write it down on paper with a pen. Do not take a screenshot or save it digitally.</li>
              <li>Store it in a physical safe, lockbox, or a secure location protected from fire and water.</li>
              <li>Never share your phrase or secret key with anyone—not even StellarWork support.</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: "Recovering your wallet from backup",
      content: (
        <div className="space-y-3 text-slate-600 dark:text-slate-400">
          <p>
            If you forget your Freighter password, get a new computer, or want to import your account into a new device, you can use your backup:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Open the Freighter extension.</li>
            <li>Click &quot;Import Wallet&quot; (instead of Create Wallet).</li>
            <li>Enter your 12-word recovery phrase in the exact order.</li>
            <li>Set a new password for the extension, and your wallet will be restored.</li>
          </ol>
        </div>
      ),
    },
    {
      title: "Switching between multiple wallets",
      content: (
        <div className="space-y-3 text-slate-600 dark:text-slate-400">
          <p>
            If you want to use different accounts for different roles (e.g., one as a freelancer and one as a client), you can manage them within Freighter:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Create/Import:</strong> Open Freighter, click the account dropdown at the top, and select &quot;Create Account&quot; or &quot;Import Account&quot; (using a secret key).
            </li>
            <li>
              <strong>Switching on StellarWork:</strong> Change the active account inside the Freighter extension, then click your wallet button on StellarWork and reconnect or refresh the page to sync.
            </li>
          </ul>
        </div>
      ),
    },
    {
      title: "Security best practices",
      content: (
        <div className="space-y-3 text-slate-600 dark:text-slate-400">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Hardware Wallets:</strong> For substantial balances, connect a hardware wallet (like Ledger) to Freighter. Your private keys never leave the device.
            </li>
            <li>
              <strong>Bookmark the Site:</strong> Always access StellarWork via your bookmarks to avoid landing on phishing sites that look identical but steal keys.
            </li>
            <li>
              <strong>No Online Inputs:</strong> Never enter your recovery phrase or secret key into any website, form, or popup other than the official Freighter extension itself.
            </li>
          </ul>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-10 py-6 px-4">
      {/* Hero Header */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-950 p-8 text-white shadow-xl dark:from-slate-900 dark:to-slate-950">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Help &amp; Security Center
        </h1>
        <p className="mt-2 text-lg text-blue-200 dark:text-slate-400 max-w-2xl">
          Your guide to managing Stellar accounts, securing secret keys, and recovering wallet access safely.
        </p>
      </div>

      {/* Critical Security Warning Banners */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Critical Security Warnings
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Warning 1 */}
          <div className="flex flex-col justify-between rounded-xl border border-red-200 bg-red-50/50 p-5 dark:border-red-900/50 dark:bg-red-950/20">
            <div>
              <div className="flex items-center gap-2 text-red-800 dark:text-red-400 font-semibold mb-2">
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Never Share Your Keys</span>
              </div>
              <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                Your secret key (starting with &apos;S&apos;) and 12-word recovery phrase grant full access to your funds. 
                <strong> No support agent or smart contract will ever ask for them.</strong>
              </p>
            </div>
          </div>

          {/* Warning 2 */}
          <div className="flex flex-col justify-between rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div>
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-semibold mb-2">
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Backup is Mandatory</span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                StellarWork is non-custodial. We cannot reset your password or recover your account. 
                If you lose your recovery phrase and your device, <strong>your funds are lost forever.</strong>
              </p>
            </div>
          </div>

          {/* Warning 3 */}
          <div className="flex flex-col justify-between rounded-xl border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
            <div>
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-400 font-semibold mb-2">
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Verify the URL</span>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                Always double-check the browser address bar. Phishing sites copy the look of our platform to capture your keys. 
                Always ensure you are on the official domain.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Accordion Guides */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Frequently Asked Questions &amp; Guides
        </h2>
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
          {accordionItems.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={index} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleAccordion(index)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left font-medium text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-900/50"
                  aria-expanded={isOpen}
                >
                  <span>{item.title}</span>
                  <svg
                    className={`h-5 w-5 text-slate-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div
                  className={`transition-all duration-200 ease-in-out ${
                    isOpen ? "max-h-[500px] border-t border-slate-100 px-6 py-4 dark:border-slate-800" : "max-h-0"
                  } overflow-hidden`}
                >
                  {item.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full Guide Link Callout */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-6 text-center dark:border-blue-900/30 dark:bg-blue-950/10">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Need the full technical guide?
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          For detailed information on hardware wallets (like Ledger), advanced key management practices, and technical recovery paths, read the official repository guide.
        </p>
        <div className="mt-4">
          <a
            href="https://github.com/anumukul/Stellar-work-/blob/main/docs/ACCOUNT_MANAGEMENT.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            <span>Read Full Guide on GitHub</span>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
