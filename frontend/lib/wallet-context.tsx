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
import type { StellarNetwork } from "@/lib/network-config";
import LegalConsentModal, { hasAcceptedLegal } from "@/components/LegalConsentModal";
import LegalConsentModal, { hasAcceptedLegal, acceptLegal } from "@/components/LegalConsentModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { CONFIRM_KEYS } from "@/lib/confirm-prefs";
import { toXlm } from "@/lib/format";
import { checkConnectionRateLimit, recordConnectionSuccess, recordConnectionFailure } from "@/lib/connection-rate-limiter";

// Storage keys
const LAST_ACCOUNT_KEY = "stellarwork:last-connected-account";
const WALLET_AUTO_RECONNECT_KEY = "stellarwork:wallet-auto-reconnect";
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

/** Remove all wallet-specific cache entries from localStorage. */
function clearWalletData() {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    
    if (
      key.startsWith(JOB_CACHE_PREFIX) ||
      key.startsWith("stellarwork:post-job-draft:") ||
      key.startsWith("stellarwork:dashboard-widgets:") ||
      [
        "stellarwork:notifications",
        "stellarwork:bookmarked-jobs",
        "stellarwork:resume-builder",
        "stellarwork:recent-contract-interactions",
        "sw:call-history",
        "stellarwork:meetings"
      ].includes(key)
    ) {
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

function getLastConnectedAccount(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_ACCOUNT_KEY);
}

function getAutoReconnectPreference(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(WALLET_AUTO_RECONNECT_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  // Migrate existing sessions that stored an address before the flag existed.
  return getLastConnectedAccount() !== null;
}

function setAutoReconnectPreference(connected: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WALLET_AUTO_RECONNECT_KEY, connected ? "true" : "false");
}

function clearPersistedWalletSession() {
  persistLastAccount(null);
  setAutoReconnectPreference(false);
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

  // On mount: restore last session when the user opted in to auto-reconnect.
  useEffect(() => {
    if (!getAutoReconnectPreference()) {
      return;
    }

    getPublicKey().then(async (key) => {
      if (key) {
        setWallet(key);
        persistLastAccount(key);
        await refreshWalletNetwork();
        return;
      }

      // Freighter permission was revoked or the extension is unavailable.
      clearPersistedWalletSession();
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

  // Listen for account change events or Freighter extension wallet switches
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const checkAccountChange = async () => {
      try {
        const currentKey = await getPublicKey();
        if (currentKey && wallet && currentKey !== wallet) {
          clearWalletData();
          setWallet(currentKey);
          persistLastAccount(currentKey);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("stellarwork:account-changed", {
                detail: { address: currentKey },
              }),
            );
          }
        }
      } catch {
        // Ignore extension communication errors
      }
    };

    const onFocus = () => {
      void checkAccountChange();
    };
    window.addEventListener("focus", onFocus);

    intervalId = setInterval(checkAccountChange, 2000);

    return () => {
      window.removeEventListener("focus", onFocus);
      if (intervalId) clearInterval(intervalId);
    };
  }, [wallet]);

  useEffect(() => {
    if (wallet && !hasAcceptedLegal()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowLegalModal(true);
    }
  }, [wallet]);
  const clearCachedData = useCallback(() => {
    clearWalletData();
  }, []);

  const connectWallet = useCallback(async () => {
    if (wallet) return;

    try {
      checkConnectionRateLimit();
    } catch (e) {
      if (typeof window !== "undefined") {
        alert(e instanceof Error ? e.message : String(e));
      }
      throw e;
    }

    if (!connectPromiseRef.current) {
      connectPromiseRef.current = stellarConnectWallet().then((res) => {
        recordConnectionSuccess();
        return res;
      }).catch((err) => {
        recordConnectionFailure();
        throw err;
      }).finally(() => {
        connectPromiseRef.current = null;
      });
    }

    const key = await connectPromiseRef.current;
    setWallet(key);
    persistLastAccount(key);
    setAutoReconnectPreference(true);
    await refreshWalletNetwork();
  }, [wallet, refreshWalletNetwork]);

  const disconnectWallet = useCallback(() => {
    clearWalletData();
    setWallet(null);
    setWalletNetwork(null);
    clearPersistedWalletSession();
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
      checkConnectionRateLimit();
      // Re-request access so Freighter shows the account picker.
      const newKey = await stellarConnectWallet();
      recordConnectionSuccess();
      if (newKey && newKey !== wallet) {
        clearWalletData();
        setWallet(newKey);
        persistLastAccount(newKey);
        setAutoReconnectPreference(true);
      }
      await refreshWalletNetwork();
    } catch (err) {
      recordConnectionFailure();
      if (typeof window !== "undefined" && err instanceof Error && err.message.includes("Too many")) {
        alert(err.message);
      }
      throw err;
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
