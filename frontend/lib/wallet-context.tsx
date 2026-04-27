"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  connectWallet as stellarConnectWallet,
  getPublicKey,
} from "@/lib/stellar";

interface WalletContextType {
  wallet: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextType>({
  wallet: null,
  connectWallet: async () => {},
  disconnectWallet: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<string | null>(null);

  useEffect(() => {
    getPublicKey().then((key) => {
      if (key) setWallet(key);
    });
  }, []);

  const connectWallet = useCallback(async () => {
    const key = await stellarConnectWallet();
    setWallet(key);
  }, []);

  const disconnectWallet = useCallback(() => {
    setWallet(null);
  }, []);

  return (
    <WalletContext.Provider value={{ wallet, connectWallet, disconnectWallet }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}

export function WalletButton() {
  const { wallet, connectWallet, disconnectWallet } = useWallet();

  if (wallet) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-700">
          {wallet.slice(0, 6)}...{wallet.slice(-4)}
        </span>
        <button
          onClick={disconnectWallet}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={async () => {
        try {
          await connectWallet();
        } catch {
          /* user cancelled or Freighter unavailable */
        }
      }}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
    >
      Connect Wallet
    </button>
  );
}
