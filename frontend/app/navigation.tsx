"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet, WalletButton } from "@/lib/wallet-context";
import { useMessaging } from "@/lib/messaging-context";
import { useTheme } from "@/components/ThemeProvider";
import { useLocale } from "next-intl";
import { memo, useState, useEffect, useRef } from "react";
import NetworkBadge from "@/components/NetworkBadge";
import NetworkSwitcher from "@/components/NetworkSwitcher";
import NotificationInbox from "@/components/NotificationInbox";
import WalletMenu from "@/components/WalletMenu";
import VoiceNav from "@/components/VoiceNav";

const ThemeToggle = memo(function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycle = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <button
      onClick={cycle}
      className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      aria-label={`Theme: ${theme}`}
      title={`Theme: ${theme}`}
    >
      {theme === "light" ? (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : theme === "dark" ? (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
});

const LanguageSwitcher = memo(function LanguageSwitcher() {
  const locale = useLocale();

  const cycleLocale = () => {
    const nextLocale = locale === "en" ? "es" : "en";
    document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000`;
    window.location.reload();
  };

  return (
    <button
      onClick={cycleLocale}
      className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      aria-label={`Switch language: ${locale === "en" ? "Español" : "English"}`}
      title={locale === "en" ? "Switch to Español" : "Switch to English"}
    >
      {locale === "en" ? "ES" : "EN"}
    </button>
  );
});

export const Navigation = memo(function Navigation() {
  const pathname = usePathname();
  const { wallet } = useWallet();
  const { unreadCount } = useMessaging();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const lastLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      firstLinkRef.current?.focus();
    }
  }, [menuOpen]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const focusable = menuRef.current?.querySelectorAll<HTMLElement>(
      "a, button:not([disabled])",
    );
    if (!focusable || focusable.length === 0) return;

    const items = Array.from(focusable);
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === "Tab") {
      if (event.shiftKey) {
        if (document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        }
      } else {
        if (document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[nextIndex]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prevIndex]?.focus();
    }
  };

  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
  const showAdmin = wallet && adminAddress && wallet === adminAddress;

  const links: Array<{ href: string; label: string; shortcut?: string }> = [
    { href: "/", label: "Jobs" },
    { href: "/post-job", label: "Post Job", shortcut: "n" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/meetings", label: "Meetings" },
    { href: "/transactions", label: "Transactions" },
    { href: "/disputes", label: "Disputes" },
    { href: "/messages", label: "Messages" },
  ];

  if (showAdmin) {
    links.push({ href: "/admin", label: "Admin" });
  }

  if (wallet) {
    links.push({ href: `/profile/${wallet}`, label: "Profile" });
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="shrink-0 text-lg font-semibold dark:text-slate-100">
            StellarWork
          </Link>
          <NetworkBadge />
        </div>

        <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 lg:inline-block">
          ⌘K
        </kbd>

        <div className="hidden min-w-0 items-center gap-4 lg:flex">
          <nav
            aria-label="Main navigation"
            className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm"
          >
            {links.map(({ href, label, shortcut }) => (
              <Link
                key={href}
                href={href}
                className={
                  isActive(href)
                    ? "font-semibold text-slate-900 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }
                aria-current={isActive(href) ? "page" : undefined}
              >
                <span className="relative inline-flex items-center gap-1">
                  {label}
                  {href === "/messages" && unreadCount > 0 && (
                    <span
                      className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white"
                      aria-label={`${unreadCount} unread messages`}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </span>
                {shortcut && (
                  <kbd
                    aria-hidden="true"
                    className="ml-1 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                  >
                    {shortcut}
                  </kbd>
                )}
              </Link>
            ))}
          </nav>

          <VoiceNav />
          <NotificationInbox />
          <ThemeToggle />
          <LanguageSwitcher />
          <NetworkSwitcher />
          <WalletMenu />
        </div>

        <button
          ref={menuButtonRef}
          className="rounded-md p-2 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-menu"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            {menuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div
          id="mobile-nav-menu"
          ref={menuRef}
          className="border-t border-slate-200 px-4 py-3 dark:border-slate-800 lg:hidden"
          onKeyDown={handleMenuKeyDown}
        >
          <nav aria-label="Main navigation" className="flex flex-col gap-2 text-sm">
            {links.map(({ href, label, shortcut }, index) => (
              <Link
                key={href}
                ref={
                  index === 0
                    ? firstLinkRef
                    : index === links.length - 1
                      ? lastLinkRef
                      : undefined
                }
                href={href}
                className={
                  isActive(href)
                    ? "rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    : "rounded-md px-2 py-1 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                }
                aria-current={isActive(href) ? "page" : undefined}
                aria-label={shortcut ? `${label} (shortcut: ${shortcut})` : label}
                onClick={() => {
                  setMenuOpen(false);
                  menuButtonRef.current?.focus();
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {label}
                  {href === "/messages" && unreadCount > 0 && (
                    <span
                      className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white"
                      aria-label={`${unreadCount} unread messages`}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </span>
                {shortcut && (
                  <kbd className="ml-1 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
                    {shortcut}
                  </kbd>
                )}
              </Link>
            ))}
          </nav>

          <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <WalletButton />
          </div>
        </div>
      )}
    </header>
  );
});
