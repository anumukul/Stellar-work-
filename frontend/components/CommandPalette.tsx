"use client";

import { useModalFocusTrap } from "@/lib/modal";
import { useWallet } from "@/lib/wallet-context";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CommandItem = {
  id: string;
  label: string;
  keywords: string[];
  shortcut?: string;
  run: () => void;
};

const RECENT_COMMANDS_KEY = "stellarwork_recent_commands";

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qIdx = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === q[qIdx]) {
      qIdx++;
    }
    if (qIdx === q.length) return true;
  }
  return false;
}

export default function CommandPalette() {
  const router = useRouter();
  const { wallet, connectWallet } = useWallet();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
      if (stored) {
        setRecentIds(JSON.parse(stored));
      }
    } catch (e) {
      // Ignore
    }
  }, []);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: "jobs",
        label: "Go to Jobs",
        keywords: ["home", "jobs", "browse"],
        shortcut: "G J",
        run: () => router.push("/"),
      },
      {
        id: "post-job",
        label: "Post Job",
        keywords: ["create", "post", "new job"],
        shortcut: "P J",
        run: () => router.push("/post-job"),
      },
      {
        id: "dashboard",
        label: "Go to Dashboard",
        keywords: ["dashboard", "overview"],
        shortcut: "G D",
        run: () => router.push("/dashboard"),
      },
      {
        id: "messages",
        label: "Go to Messages",
        keywords: ["chat", "messages", "inbox"],
        shortcut: "G M",
        run: () => router.push("/messages"),
      },
      {
        id: "transactions",
        label: "Go to Transactions",
        keywords: ["payments", "history", "transactions", "escrow"],
        shortcut: "G T",
        run: () => router.push("/transactions"),
      },
      {
        id: "disputes",
        label: "Go to Disputes",
        keywords: ["disputes", "conflict"],
        run: () => router.push("/disputes"),
      },
      {
        id: "settings",
        label: "Go to Settings",
        keywords: ["preferences", "settings", "config"],
        shortcut: "G S",
        run: () => router.push("/settings"),
      },
      {
        id: "earnings-estimator",
        label: "Earnings Estimator",
        keywords: ["earnings", "estimate", "calculator", "money"],
        run: () => router.push("/earnings-estimator"),
      },
      {
        id: "fee-calculator",
        label: "Fee Calculator",
        keywords: ["fees", "calculator", "cost"],
        run: () => router.push("/fee-calculator"),
      },
      {
        id: "help",
        label: "Help & Support",
        keywords: ["help", "support", "faq"],
        shortcut: "?",
        run: () => router.push("/help"),
      },
      {
        id: "admin",
        label: "Admin Panel",
        keywords: ["admin", "super", "manage"],
        run: () => router.push("/admin"),
      },
      {
        id: "meetings",
        label: "Meetings",
        keywords: ["video", "call", "meetings", "schedule"],
        run: () => router.push("/meetings"),
      },
      {
        id: "legal-terms",
        label: "Terms of Service",
        keywords: ["legal", "terms", "service"],
        run: () => router.push("/legal/terms"),
      },
      {
        id: "legal-privacy",
        label: "Privacy Policy",
        keywords: ["legal", "privacy", "policy"],
        run: () => router.push("/legal/privacy"),
      },
      {
        id: "shortcuts",
        label: "Show Shortcuts",
        keywords: ["help", "keyboard", "shortcuts"],
        shortcut: "Cmd+/",
        run: () => {
          const event = new KeyboardEvent("keydown", { key: "?" });
          window.dispatchEvent(event);
        },
      },
    ];

    if (!wallet) {
      items.push({
        id: "connect-wallet",
        label: "Connect Wallet",
        keywords: ["wallet", "connect", "freighter"],
        run: () => {
          void connectWallet();
        },
      });
    } else {
      items.push({
        id: "profile",
        label: "Go to Profile",
        keywords: ["profile", "account"],
        shortcut: "G P",
        run: () => router.push(`/profile/${wallet}`),
      });
    }

    return items;
  }, [connectWallet, router, wallet]);

  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    
    if (!normalized) {
      // Show recent commands first if no query
      const recent = commands.filter((c) => recentIds.includes(c.id))
        .sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));
      const others = commands.filter((c) => !recentIds.includes(c.id));
      return [...recent, ...others];
    }

    return commands.filter((command) => {
      const haystack = [command.label, ...command.keywords].join(" ").toLowerCase();
      return fuzzyMatch(normalized, haystack);
    });
  }, [commands, query, recentIds]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const executeCommand = useCallback(
    (command: CommandItem) => {
      command.run();
      setRecentIds((prev) => {
        const newRecent = [command.id, ...prev.filter((id) => id !== command.id)].slice(0, 5);
        try {
          localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(newRecent));
        } catch (e) {
          // Ignore
        }
        return newRecent;
      });
      close();
    },
    [close],
  );

  useModalFocusTrap(open, dialogRef, close);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isPaletteShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

      if (isPaletteShortcut) {
        event.preventDefault();
        setOpen((current) => !current);
        setQuery("");
        setSelectedIndex(0);
        return;
      }

      if (!open) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) =>
          filteredCommands.length === 0
            ? 0
            : (current + 1) % filteredCommands.length,
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) =>
          filteredCommands.length === 0
            ? 0
            : (current - 1 + filteredCommands.length) % filteredCommands.length,
        );
      } else if (event.key === "Enter" && filteredCommands[selectedIndex]) {
        event.preventDefault();
        executeCommand(filteredCommands[selectedIndex]);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [executeCommand, filteredCommands, open, selectedIndex]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[15vh] backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5"
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search commands (e.g. jobs, profile)..."
            aria-label="Search commands"
            className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>
        <ul role="listbox" aria-label="Commands" className="max-h-72 overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">No matching commands.</li>
          ) : (
            filteredCommands.map((command, index) => {
              const isRecent = !query && recentIds.includes(command.id);
              return (
                <li key={command.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === selectedIndex}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => executeCommand(command)}
                    className={`flex w-full items-center px-4 py-2.5 text-left text-sm ${
                      index === selectedIndex
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex-1">{command.label}</span>
                    {isRecent && (
                      <span className="mr-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Recent
                      </span>
                    )}
                    {command.shortcut && (
                      <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {command.shortcut}
                      </kbd>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
          <span>
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-medium">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-medium">↵</kbd> select
          </span>
          <span>
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-medium">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
