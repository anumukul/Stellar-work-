"use client";

import { useNotifications, getEventLabel } from "@/lib/notifications-context";
import { useModalFocusTrap } from "@/lib/modal";
import type { NotificationEvent } from "@/lib/types";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";

export default function NotificationInbox() {
  const {
    notifications,
    unreadCount,
    markAsSeen,
    markAllAsSeen,
    preferences,
    setPreference,
    clearNotifications,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    setShowPrefs(false);
  }, []);

  useModalFocusTrap(open, dropdownRef, handleClose);

  const allEvents = Object.keys(preferences) as NotificationEvent[];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5"
          tabIndex={-1}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setShowPrefs((v) => !v);
                }}
                className="rounded-md px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
                aria-label="Notification preferences"
              >
                Settings
              </button>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    markAllAsSeen();
                  }}
                  className="rounded-md px-2 py-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  Mark all seen
                </button>
              )}
            </div>
          </div>

          {showPrefs ? (
            <div className="px-4 py-3 space-y-2">
              <p className="text-xs font-medium text-slate-700">Notify me when:</p>
              {allEvents.map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-2 text-sm text-slate-600"
                >
                  <input
                    type="checkbox"
                    checked={preferences[event]}
                    onChange={(e) => setPreference(event, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {getEventLabel(event)}
                </label>
              ))}
              <button
                type="button"
                onClick={() => setShowPrefs(false)}
                className="mt-2 w-full rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Done
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No notifications yet.
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto" aria-label="Notifications list">
              {notifications.slice(0, 50).map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/job/${n.jobId}`}
                    className={`flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-slate-50 ${
                      !n.seen ? "bg-blue-50/50" : ""
                    }`}
                    onClick={() => {
                      markAsSeen(n.id);
                      setOpen(false);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900">
                        {getEventLabel(n.event)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">
                        {n.message}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {new Date(n.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {!n.seen && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {notifications.length > 0 && !showPrefs && (
            <div className="border-t border-slate-100 px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  clearNotifications();
                }}
                className="w-full rounded-md px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
