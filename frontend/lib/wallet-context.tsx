"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  connectWallet as stellarConnectWallet,
  getPublicKey,
  getNativeBalance,
  getWalletNetwork,
  watchWalletNetworkChanges,
} from "@/lib/stellar";
import LegalConsentModal, { hasAcceptedLegal, acceptLegal } from "@/components/LegalConsentModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { CONFIRM_KEYS } from "@/lib/confirm-prefs";
import { toXlm } from "@/lib/format";

// Storage keys
const LAST_ACCOUNT_KEY = "stellarwork:last-connected-account";
const JOB_CACHE_PREFIX = "job-desc:";

interface WalletContextType {
  wallet: string | null;
  walletNetwork: StellarNetwork | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchAccount: (address?: string) => Promise<void>;
  clearCachedData: () => void;
  refreshWalletNetwork: () => Promise<void>;
  isSwitching: boolean;
}

type WalletDisplayMode = "short" | "full";

const WalletContext = createContext<WalletContextType>({
  wallet: null,
  walletNetwork: null,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  connectWallet: async () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  disconnectWallet: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  switchAccount: async () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  clearCachedData: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  refreshWalletNetwork: async () => {},
  isSwitching: false,
});

/** Remove all job description cache entries from localStorage. */
function clearJobCache() {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(JOB_CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

/** Persist the last-connected address so we can auto-reconnect on mount. */
function persistLastAccount(address: string | null) {
  if (typeof window === "undefined") return;
  if (address) {
    localStorage.setItem(LAST_ACCOUNT_KEY, address);
  } else {
    localStorage.removeItem(LAST_ACCOUNT_KEY);
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletNetwork, setWalletNetwork] = useState<StellarNetwork | null>(null);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const connectPromiseRef = useRef<Promise<string> | null>(null);

  const refreshWalletNetwork = useCallback(async () => {
    const nextNetwork = await getWalletNetwork();
    setWalletNetwork(nextNetwork);
  }, []);

  // On mount: restore last session via Freighter if still allowed.
  useEffect(() => {
    getPublicKey().then(async (key) => {
      if (key) {
        setWallet(key);
        persistLastAccount(key);
        await refreshWalletNetwork();
      }
    });
  }, [refreshWalletNetwork]);

  useEffect(() => {
    if (!wallet) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshWalletNetwork();
    return watchWalletNetworkChanges(({ address, network }) => {
      if (address) {
        setWallet(address);
        persistLastAccount(address);
      }
      setWalletNetwork(network);
    });
  }, [wallet, refreshWalletNetwork]);

  useEffect(() => {
    if (wallet && !hasAcceptedLegal()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowLegalModal(true);
    }
  }, [wallet]);
  const clearCachedData = useCallback(() => {
    clearJobCache();
  }, []);

  const connectWallet = useCallback(async () => {
    if (wallet) return;

    if (!connectPromiseRef.current) {
      connectPromiseRef.current = stellarConnectWallet().finally(() => {
        connectPromiseRef.current = null;
      });
    }

    const key = await connectPromiseRef.current;
    setWallet(key);
    persistLastAccount(key);
    await refreshWalletNetwork();
  }, [wallet, refreshWalletNetwork]);

  const disconnectWallet = useCallback(() => {
    setWallet(null);
    setWalletNetwork(null);
    persistLastAccount(null);
    // Clear session display preference
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("wallet-display-mode");
    }
  }, []);

  const declineLegal = useCallback(() => {
    setShowLegalModal(false);
    setWallet(null);
  }, []);
  /**
   * Switch to a different Freighter account.
   * Triggers Freighter's account selection, clears job cache, then updates state.
   * Caller is responsible for showing a confirmation dialog before calling this.
   */
  const switchAccount = useCallback(async () => {
    setIsSwitching(true);
    try {
      // Re-request access so Freighter shows the account picker.
      const newKey = await stellarConnectWallet();
      if (newKey && newKey !== wallet) {
        clearJobCache();
        setWallet(newKey);
        persistLastAccount(newKey);
      }
      await refreshWalletNetwork();
    } finally {
      setIsSwitching(false);
    }
  }, [wallet, refreshWalletNetwork]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        walletNetwork,
        connectWallet,
        disconnectWallet,
        switchAccount,
        clearCachedData,
        refreshWalletNetwork,
        isSwitching,
      }}
    >
      {children}
      {showLegalModal && (
        <LegalConsentModal
          onAccept={() => setShowLegalModal(false)}
          onClose={declineLegal}
        />
      )}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}

// ---------------------------------------------------------------------------
// WalletButton — compact connect/disconnect used in the mobile nav drawer
// ---------------------------------------------------------------------------

export function WalletButton() {
  const { wallet, connectWallet, disconnectWallet } = useWallet();
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [displayMode, setDisplayMode] = useState<WalletDisplayMode>("short");
  const [balance, setBalance] = useState<string | null>(null);
  const [fetchingBalance, setFetchingBalance] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!wallet) return;
    setFetchingBalance(true);
    try {
      const bal = await getNativeBalance(wallet);
      setBalance(toXlm(bal));
    } catch {
      setBalance("0.00");
    } finally {
      setFetchingBalance(false);
    }
  }, [wallet]);

  useEffect(() => {
    const stored = sessionStorage.getItem("wallet-display-mode");
    if (stored === "short" || stored === "full") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayMode(stored);
    }
  }, []);

  useEffect(() => {
    if (!wallet) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayMode("short");
      setBalance(null);
    } else {
      fetchBalance();
    }
  }, [wallet, fetchBalance]);

  const toggleDisplayMode = useCallback(() => {
    setDisplayMode((current) => {
      const next: WalletDisplayMode = current === "short" ? "full" : "short";
      sessionStorage.setItem("wallet-display-mode", next);
      return next;
    });
  }, []);

  if (wallet) {
    const visibleAddress =
      displayMode === "full" ? wallet : `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;

    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
          {fetchingBalance ? (
            <span className="h-4 w-12 animate-pulse rounded bg-slate-200" />
          ) : (
            <span className="font-semibold">{balance} XLM</span>
          )}
          <button
            onClick={fetchBalance}
            className="text-slate-400 hover:text-slate-600 focus:outline-none"
            aria-label="Refresh balance"
            disabled={fetchingBalance}
          >
            <svg className={`h-3 w-3 ${fetchingBalance ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <span className="text-slate-300">|</span>
          <span className="font-mono">{visibleAddress}</span>
        </div>
        <button
          type="button"
          onClick={toggleDisplayMode}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          aria-label={
            displayMode === "short"
              ? "Show full wallet address"
              : "Show shortened wallet address"
          }
        >
          {displayMode === "short" ? "Show full" : "Show short"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmDisconnect(true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          Disconnect
        </button>
        {confirmDisconnect && (
          <ConfirmDialog
            open={true}
            title="Disconnect wallet?"
            description="Disconnecting removes this wallet from the app. Job actions will be hidden until you reconnect."
            consequences={["Bookmarks and preferences saved in this browser are kept.", "You can reconnect at any time with the Connect Wallet button."]}
            confirmLabel="Yes, disconnect"
            cancelLabel="Cancel"
            variant="danger"
            suppressKey={CONFIRM_KEYS.disconnectWallet}
            onConfirm={() => {
              setConfirmDisconnect(false);
              disconnectWallet();
            }}
            onCancel={() => setConfirmDisconnect(false)}
          />
        )}
      </div>
    );
  }

  return (
    <button
      onClick={async () => {
        setConnecting(true);
        try {
          await connectWallet();
        } catch {
          /* user cancelled or Freighter unavailable */
        } finally {
          setConnecting(false);
        }
      }}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
      disabled={connecting}
      aria-busy={connecting}
    >
      {connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
