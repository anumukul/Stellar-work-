"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useModalFocusTrap } from "@/lib/modal";

const SHORTCUTS = [
  {
    category: "Navigation",
    items: [
      { keys: ["g", "h"], description: "Home" },
      { keys: ["g", "d"], description: "Dashboard" },
      { keys: ["g", "p"], description: "Post Job" },
      { keys: ["g", "a"], description: "Admin" },
    ],
  },
  {
    category: "Actions",
    items: [
      { keys: ["n"], description: "New Job" },
      { keys: ["/"], description: "Focus Search" },
      { keys: ["c"], description: "Connect Wallet" },
    ],
  },
  {
    category: "General",
    items: [
      { keys: ["?"], description: "This menu" },
      { keys: ["Escape"], description: "Close modal or dialog" },
      { keys: ["Enter"], description: "Submit form or confirm action" },
      { keys: ["Ctrl", "k"], description: "Command Palette" },
    ],
  },
];

export default function ShortcutCheatSheet() {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditableField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target?.isContentEditable ?? false);

      if (isEditableField) {
        return;
      }

      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setIsOpen(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useModalFocusTrap(isOpen, dialogRef, close);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 transition-opacity backdrop-blur-sm"
      onClick={() => setIsOpen(false)}
    >
      <div 
        ref={dialogRef}
        className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="shortcuts-title" className="text-xl font-semibold text-slate-900 dark:text-white">Keyboard Shortcuts</h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close shortcuts dialog"
          >
            ✕
          </button>
        </div>

        <nav aria-label="Keyboard shortcut overview">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {SHORTCUTS.map((group) => (
              <section key={group.category} aria-label={`${group.category} shortcuts`}>
                <h3 className="mb-3 font-medium text-slate-900 dark:text-white">{group.category}</h3>
                <ul className="space-y-3">
                  {group.items.map((shortcut, i) => (
                    <li key={i} className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-slate-600 dark:text-slate-400">{shortcut.description}</span>
                      <span className="flex gap-1">
                        {shortcut.keys.map((k, j) => (
                          <kbd key={j} className="min-w-[1.5rem] flex items-center justify-center rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
