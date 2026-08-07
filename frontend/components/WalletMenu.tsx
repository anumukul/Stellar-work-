"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import TruncatedAddress from "@/components/TruncatedAddress";
import { useWallet } from "@/lib/wallet-context";
import ConfirmDialog from "@/components/ConfirmDialog";
import { CONFIRM_KEYS } from "@/lib/confirm-prefs";
import { truncateAddress } from "@/lib/stellar";

/**
 * WalletMenu — desktop nav dropdown shown when a wallet is connected.
 *
 * Features:
 *  - Shows connected address (short) with a green active indicator
 *  - Dropdown with full address, "Switch Account" and "Disconnect" actions
 *  - Confirmation step before switching to prevent accidental data loss
 *  - Keyboard accessible (Escape closes, arrow keys move between items)
 */
export default function WalletMenu() {
  const { wallet, connectWallet, disconnectWallet, switchAccount, isSwitching } = useWallet();
  const [open, setOpen] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
        setConfirmSwitch(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirmSwitch(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Focus first item when menu opens
  useEffect(() => {
    if (!open) return;
    const firstItem = menuRef.current?.querySelector<HTMLElement>("[role='menuitem']");
    firstItem?.focus();
  }, [open, confirmSwitch]);

  // Arrow-key navigation within menu
  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = idx < items.length - 1 ? idx + 1 : 0;
      items[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = idx > 0 ? idx - 1 : items.length - 1;
      items[prev]?.focus();
    }
  }, []);

  const handleDisconnectRequest = useCallback(() => {
    setConfirmDisconnect(true);
  }, []);

  const handleDisconnectConfirm = useCallback(() => {
    setConfirmDisconnect(false);
    disconnectWallet();
    setOpen(false);
    setConfirmSwitch(false);
  }, [disconnectWallet]);

  const handleDisconnectCancel = useCallback(() => {
    setConfirmDisconnect(false);
  }, []);

  const handleSwitchRequest = useCallback(() => {
    setConfirmSwitch(true);
  }, []);

  const handleSwitchConfirm = useCallback(async () => {
    setConfirmSwitch(false);
    setOpen(false);
    await switchAccount();
  }, [switchAccount]);

  const handleSwitchCancel = useCallback(() => {
    setConfirmSwitch(false);
  }, []);

  // Not connected — show a plain Connect button
  if (!wallet) {
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
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 hover:bg-slate-700 transition-colors"
        disabled={connecting}
        aria-busy={connecting}
      >
        {connecting ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  const shortAddress = truncateAddress(wallet);

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setConfirmSwitch(false);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Wallet menu — connected as ${shortAddress}`}
        className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        {/* Green "connected" dot */}
        <span
          className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"
          aria-hidden="true"
        />
        <span className="font-mono text-xs">
          <TruncatedAddress address={wallet} className="font-mono text-xs" focusable={false} />
        </span>
        {/* Chevron */}
        <svg
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Wallet options"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
        >
          {!confirmSwitch ? (
            <>
              {/* Address section */}
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Connected account
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"
                    aria-hidden="true"
                  />
                  <p
                    className="font-mono text-xs text-slate-700 break-all leading-relaxed"
                    title={wallet}
                  >
                    {wallet}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(wallet).catch(() => undefined);
                  }}
                  className="mt-2 text-xs text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 rounded"
                  aria-label="Copy wallet address to clipboard"
                >
                  Copy address
                </button>
              </div>

              {/* Actions */}
              <div className="py-1" role="none">
                <button
                  role="menuitem"
                  type="button"
                  onClick={handleSwitchRequest}
                  disabled={isSwitching}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:bg-slate-50 focus:outline-none"
                >
                  {/* Switch icon */}
                  <svg
                    className="h-4 w-4 text-slate-400 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                  {isSwitching ? "Switching…" : "Switch Account"}
                </button>

                <div className="my-1 border-t border-slate-100" role="separator" />

                <button
                  role="menuitem"
                  type="button"
                  onClick={handleDisconnectRequest}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 focus-visible:bg-red-50 focus:outline-none"
                >
                  {/* Disconnect icon */}
                  <svg
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Disconnect Wallet
                </button>
              </div>
            </>
          ) : (
            /* Confirmation panel for account switch */
            <div className="px-4 py-4" role="none">
              <div className="flex items-start gap-3 mb-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <svg
                    className="h-4 w-4 text-amber-600"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Switch Account?</p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    Freighter will ask you to select a different account. Your job cache will be
                    cleared and data will refresh for the new account.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  role="menuitem"
                  type="button"
                  onClick={handleSwitchConfirm}
                  disabled={isSwitching}
                  className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  {isSwitching ? "Switching…" : "Yes, Switch"}
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={handleSwitchCancel}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
          onConfirm={handleDisconnectConfirm}
          onCancel={handleDisconnectCancel}
        />
      )}
    </div>
  );
}
