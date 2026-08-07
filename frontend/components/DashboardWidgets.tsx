"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet-context";
import { Settings, X, GripVertical, Plus, RotateCcw } from "lucide-react";

export type WidgetSize = "1x1" | "2x1" | "1x2" | "2x2";

export interface WidgetConfig {
  id: string;
  title: string;
  size: WidgetSize;
  visible: boolean;
  order: number;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "active-jobs", title: "Active Jobs", size: "2x1", visible: true, order: 0 },
  { id: "recent-activity", title: "Recent Activity", size: "2x1", visible: true, order: 1 },
  { id: "financial-summary", title: "Financial Summary", size: "2x1", visible: true, order: 2 },
  { id: "quick-actions", title: "Quick Actions", size: "1x1", visible: true, order: 3 },
  { id: "job-alerts", title: "Job Alerts", size: "1x1", visible: true, order: 4 },
  { id: "platform-stats", title: "Platform Stats", size: "2x2", visible: false, order: 5 },
];

const STORAGE_KEY_PREFIX = "stellarwork:dashboard-widgets:";

function getStorageKey(wallet: string | null): string {
  return `${STORAGE_KEY_PREFIX}${wallet ?? "anonymous"}`;
}

function loadWidgets(wallet: string | null): WidgetConfig[] {
  if (typeof window === "undefined") return DEFAULT_WIDGETS;
  try {
    const stored = localStorage.getItem(getStorageKey(wallet));
    if (!stored) return DEFAULT_WIDGETS;
    const parsed = JSON.parse(stored) as WidgetConfig[];
    if (!Array.isArray(parsed)) return DEFAULT_WIDGETS;
    return parsed;
  } catch {
    return DEFAULT_WIDGETS;
  }
}

function saveWidgets(wallet: string | null, widgets: WidgetConfig[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getStorageKey(wallet), JSON.stringify(widgets));
}

function getGridClasses(size: WidgetSize): string {
  switch (size) {
    case "1x1":
      return "col-span-1 row-span-1";
    case "2x1":
      return "col-span-1 row-span-1 sm:col-span-2";
    case "1x2":
      return "col-span-1 row-span-2";
    case "2x2":
      return "col-span-1 row-span-1 sm:col-span-2 sm:row-span-2";
  }
}

interface DashboardWidgetsProps {
  children: React.ReactNode;
}

export default function DashboardWidgets({ children }: DashboardWidgetsProps) {
  const { wallet } = useWallet();
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => loadWidgets(wallet));
  const [editMode, setEditMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [prevWallet, setPrevWallet] = useState(wallet);

  if (wallet !== prevWallet) {
    setPrevWallet(wallet);
    setWidgets(loadWidgets(wallet));
  }

  const persist = useCallback(
    (updated: WidgetConfig[]) => {
      setWidgets(updated);
      saveWidgets(wallet, updated);
    },
    [wallet],
  );

  const toggleVisibility = useCallback(
    (id: string) => {
      const updated = widgets.map((w) =>
        w.id === id ? { ...w, visible: !w.visible } : w,
      );
      persist(updated);
    },
    [widgets, persist],
  );

  const removeWidget = useCallback(
    (id: string) => {
      const updated = widgets.map((w) =>
        w.id === id ? { ...w, visible: false } : w,
      );
      persist(updated);
    },
    [widgets, persist],
  );

  const resetLayout = useCallback(() => {
    persist(DEFAULT_WIDGETS);
  }, [persist]);

  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    setWidgets((prev) => {
      const dragIdx = prev.findIndex((w) => w.id === draggedId);
      const targetIdx = prev.findIndex((w) => w.id === targetId);
      if (dragIdx === -1 || targetIdx === -1) return prev;

      const updated = [...prev];
      const [moved] = updated.splice(dragIdx, 1);
      updated.splice(targetIdx, 0, moved);
      return updated.map((w, i) => ({ ...w, order: i }));
    });
  }, [draggedId]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    saveWidgets(wallet, widgets);
  }, [wallet, widgets]);

  const visibleWidgets = widgets
    .filter((w) => w.visible)
    .sort((a, b) => a.order - b.order);

  const hiddenWidgets = widgets.filter((w) => !w.visible);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Widget
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={resetLayout}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Reset to default layout"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Layout
            </button>
          )}
          <button
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              editMode
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
            aria-pressed={editMode}
          >
            <Settings className="h-3.5 w-3.5" />
            {editMode ? "Done" : "Customize Dashboard"}
          </button>
        </div>
      </div>

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 auto-rows-min"
        role="grid"
        aria-label="Dashboard widgets"
      >
        {visibleWidgets.map((widget) => (
          <div
            key={widget.id}
            className={`interactive-card relative p-4 ${getGridClasses(widget.size)} ${
              draggedId === widget.id ? "opacity-50" : ""
            } ${editMode ? "cursor-move ring-2 ring-dashed ring-slate-300 dark:ring-slate-600" : ""}`}
            draggable={editMode}
            onDragStart={() => handleDragStart(widget.id)}
            onDragOver={(e) => handleDragOver(e, widget.id)}
            onDragEnd={handleDragEnd}
            role="gridcell"
            aria-label={widget.title}
          >
            {editMode && (
              <>
                <div className="absolute left-2 top-2 text-slate-400">
                  <GripVertical className="h-4 w-4" />
                </div>
                <button
                  onClick={() => removeWidget(widget.id)}
                  className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label={`Remove ${widget.title}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
            <div className={editMode ? "pt-6" : ""}>
              <WidgetContent id={widget.id} />
            </div>
          </div>
        ))}
      </div>

      {children}

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Add Widgets
              </h2>
              <button
                onClick={() => setShowPicker(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close widget picker"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Select widgets to add to your dashboard.
            </p>
            <ul className="mt-4 space-y-2">
              {hiddenWidgets.map((widget) => (
                <li key={widget.id}>
                  <button
                    onClick={() => {
                      toggleVisibility(widget.id);
                      setShowPicker(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <span className="font-medium">{widget.title}</span>
                    <Plus className="h-4 w-4 text-slate-400" />
                  </button>
                </li>
              ))}
              {hiddenWidgets.length === 0 && (
                <li className="py-4 text-center text-sm text-slate-500">
                  All widgets are already visible.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function WidgetContent({ id }: { id: string }) {
  switch (id) {
    case "active-jobs":
      return (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Active Jobs
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            View your active client and freelancer jobs in the sections below.
          </p>
        </div>
      );
    case "recent-activity":
      return (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Recent Activity
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Your recent notifications and events appear below.
          </p>
        </div>
      );
    case "financial-summary":
      return (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Financial Summary
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Earnings, spending, and fee overview shown in the stats cards.
          </p>
        </div>
      );
    case "quick-actions":
      return (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Quick Actions
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/post-job"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              Post Job
            </Link>
            <Link
              href="/"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Find Work
            </Link>
            <Link
              href="/messages"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Messages
            </Link>
          </div>
        </div>
      );
    case "job-alerts":
      return (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Job Alerts
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Matching job notifications will appear here.
          </p>
        </div>
      );
    case "platform-stats":
      return (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Platform Stats
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Total jobs, volume, and platform metrics (admin only).
          </p>
        </div>
      );
    default:
      return null;
  }
}
