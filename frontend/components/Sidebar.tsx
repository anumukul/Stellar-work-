"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { useMessaging } from "@/lib/messaging-context";
import {
  Home,
  LayoutDashboard,
  Briefcase,
  MessageSquare,
  ArrowLeftRight,
  AlertTriangle,
  Shield,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";

const SIDEBAR_STATE_KEY = "stellarwork:sidebar-collapsed";
const SIDEBAR_WIDTH_EXPANDED = 220;
const SIDEBAR_WIDTH_COLLAPSED = 40;

interface SidebarLink {
  href: string;
  label: string;
  icon: typeof Home;
  badge?: number;
  adminOnly?: boolean;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { wallet } = useWallet();
  const { unreadCount } = useMessaging();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(SIDEBAR_STATE_KEY);
    return stored === "true";
  });
  const [hovered, setHovered] = useState(false);
  const mounted = typeof window !== "undefined";

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STATE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggle]);

  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
  const showAdmin = wallet && adminAddress && wallet === adminAddress;

  const links: SidebarLink[] = [
    { href: "/", label: "Home", icon: Home },
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/post-job", label: "Post Job", icon: Briefcase },
    { href: "/messages", label: "Messages", icon: MessageSquare, badge: unreadCount },
    { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
    { href: "/disputes", label: "Disputes", icon: AlertTriangle },
  ];

  if (showAdmin) {
    links.push({ href: "/admin", label: "Admin", icon: Shield, adminOnly: true });
  }

  links.push({ href: "/settings", label: "Settings", icon: Settings });

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const showLabels = !collapsed || hovered;
  const width = showLabels ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED;

  if (!mounted) return null;

  return (
    <>
      <aside
        className="fixed left-0 top-0 z-40 hidden h-full border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900 lg:flex lg:flex-col"
        style={{ width }}
        onMouseEnter={() => collapsed && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        role="navigation"
        aria-label="Sidebar navigation"
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-2 dark:border-slate-800">
          {showLabels && (
            <span className="truncate px-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              StellarWork
            </span>
          )}
          <button
            onClick={toggle}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2" aria-label="Sidebar">
          <ul className="flex flex-col gap-0.5 px-1.5">
            {links.map(({ href, label, icon: Icon, badge }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors ${
                      active
                        ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                    aria-current={active ? "page" : undefined}
                    title={label}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {showLabels && (
                      <span className="truncate">{label}</span>
                    )}
                    {badge !== undefined && badge > 0 && (
                      <span
                        className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white ${
                          showLabels ? "ml-auto" : "absolute left-5 top-0"
                        }`}
                        aria-label={`${badge} unread`}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <button
        onClick={toggle}
        className="fixed bottom-4 left-4 z-50 hidden h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 lg:flex"
        aria-label="Toggle sidebar"
        title="Toggle sidebar (⌘B)"
        style={{ left: width + 8 }}
      >
        <Menu className="h-4 w-4" />
      </button>
    </>
  );
}
