"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet, WalletButton } from "@/lib/wallet-context";
import { useState } from "react";

export function Navigation() {
  const pathname = usePathname();
  const { wallet } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
  const showAdmin = wallet && (adminAddress ? wallet === adminAddress : true);

  const links: Array<{ href: string; label: string }> = [
    { href: "/", label: "Jobs" },
    { href: "/post-job", label: "Post Job" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/disputes", label: "Disputes" },
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
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold">
          StellarWork
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          <nav className="flex items-center gap-4 text-sm">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={
                  isActive(href)
                    ? "font-semibold text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }
              >
                {label}
              </Link>
            ))}
          </nav>
          <WalletButton />
        </div>

        <button
          className="rounded-md p-2 text-slate-700 hover:bg-slate-100 md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation menu"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
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
        <div className="border-t border-slate-200 px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-3 text-sm">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={
                  isActive(href)
                    ? "font-semibold text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <WalletButton />
          </div>
        </div>
      )}
    </header>
  );
}
