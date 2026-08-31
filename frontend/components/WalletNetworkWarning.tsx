"use client";

import { useState } from "react";
import { useNetwork } from "@/lib/network-context";
import { getNetworkConfig } from "@/lib/network-config";
import { useWallet } from "@/lib/wallet-context";

function formatNetwork(network: string) {
  return network.charAt(0).toUpperCase() + network.slice(1);
}

export default function WalletNetworkWarning() {
  const { wallet, walletNetwork, refreshWalletNetwork } = useWallet();
  const { network, setNetwork } = useNetwork();
  const [switching, setSwitching] = useState(false);

  if (!wallet || !walletNetwork || walletNetwork === network) {
    return null;
  }

  const walletConfig = getNetworkConfig(walletNetwork);
  const appConfig = getNetworkConfig(network);

  const handleSwitch = async () => {
    setSwitching(true);
    try {
      setNetwork(walletNetwork);
      window.location.reload();
    } catch {
      await refreshWalletNetwork();
      setSwitching(false);
    }
  };

  return (
    <section
      className="border-b border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      role="alert"
      aria-live="polite"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-50">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Wallet network mismatch</p>
            <p className="mt-0.5 text-sm leading-6 text-amber-900 dark:text-amber-100">
              This app is using {appConfig.label}, but Freighter is connected to{" "}
              {walletConfig.label}. Transactions may fail until both networks match.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSwitch}
          disabled={switching}
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-amber-950 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-white"
        >
          {switching
            ? "Switching..."
            : `Use ${formatNetwork(walletNetwork)} in app`}
        </button>
      </div>
    </section>
  );
}
