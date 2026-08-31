"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import TruncatedAddress from "@/components/TruncatedAddress";
import { useWallet } from "@/lib/wallet-context";
import { useMessaging } from "@/lib/messaging-context";
import PullToRefresh from "@/components/PullToRefresh";
import {
  loadConversations,
  deleteConversation,
  formatMessageTime,
  shortAddr,
  type ConversationMeta,
} from "@/lib/messaging";

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyInbox() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-slate-800">No messages yet</h2>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Start a conversation from a job listing or someone&apos;s profile page.
      </p>
      <Link
        href="/"
        className="mt-5 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
      >
        Browse Jobs
      </Link>
    </div>
  );
}

// ─── Conversation row ─────────────────────────────────────────────────────────

function ConversationRow({
  convo,
  myAddress,
  onDelete,
}: {
  convo: ConversationMeta;
  myAddress: string;
  onDelete: (peer: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const isMine = convo.lastMessageFrom === myAddress;

  return (
    <li className="group relative">
      <Link
        href={`/messages/${convo.peerAddress}`}
        className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition-colors hover:border-slate-300 hover:bg-slate-50"
        aria-label={`Conversation with ${shortAddr(convo.peerAddress)}${convo.unreadCount > 0 ? `, ${convo.unreadCount} unread` : ""}`}
      >
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-slate-300 to-slate-500 text-sm font-bold text-white select-none">
            {convo.peerAddress.slice(1, 3).toUpperCase()}
          </div>
          {convo.unreadCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white"
              aria-label={`${convo.unreadCount} unread`}
            >
              {convo.unreadCount > 9 ? "9+" : convo.unreadCount}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-sm font-mono ${convo.unreadCount > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
              <TruncatedAddress
                address={convo.peerAddress}
                className={`font-mono text-sm ${convo.unreadCount > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}
                focusable={false}
              />
            </span>
            <span className="shrink-0 text-xs text-slate-400">
              {formatMessageTime(convo.lastMessageAt)}
            </span>
          </div>
          <p className={`mt-0.5 truncate text-xs ${convo.unreadCount > 0 ? "font-medium text-slate-800" : "text-slate-500"}`}>
            {isMine && <span className="text-slate-400">You: </span>}
            {convo.lastMessageSnippet || <span className="italic text-slate-400">No messages yet</span>}
          </p>
        </div>
      </Link>

      {/* Action menu */}
      <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setShowMenu((v) => !v); }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Conversation options"
            aria-expanded={showMenu}
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="8" cy="3" r="1.2" />
              <circle cx="8" cy="8" r="1.2" />
              <circle cx="8" cy="13" r="1.2" />
            </svg>
          </button>

          {showMenu && (
            <>
              {/* Backdrop */}
              <button
                type="button"
                className="fixed inset-0 z-10"
                aria-hidden="true"
                onClick={() => setShowMenu(false)}
                tabIndex={-1}
              />
              <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowMenu(false);
                    onDelete(convo.peerAddress);
                  }}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                  Delete conversation
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { wallet, connectWallet } = useWallet();
  const { refreshUnread } = useMessaging();
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    if (!wallet) return;
    setConversations(loadConversations(wallet));
  }, [wallet]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    load();
    refreshUnread();
  }, [load, refreshUnread]);

  function handleDelete(peerAddress: string) {
    if (!wallet) return;
    if (!confirm(`Delete conversation with ${shortAddr(peerAddress)}? This cannot be undone.`)) return;
    deleteConversation(wallet, peerAddress);
    load();
    refreshUnread();
  }

  const filtered = search.trim()
    ? conversations.filter((c) =>
        c.peerAddress.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : conversations;

  // ── No wallet ─────────────────────────────────────────────────────────────

  if (!wallet) {
    return (
      <section className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-center">
          <p className="text-sm text-slate-600">Connect your wallet to view messages.</p>
          <button
            className="mt-4 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            onClick={async () => {
              try { await connectWallet(); } catch { /* cancelled */ }
            }}
          >
            Connect Wallet
          </button>
        </div>
      </section>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <PullToRefresh onRefresh={handleRefresh} label="Refresh conversations" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Messages</h1>
          {conversations.length > 0 && (
            <p className="mt-0.5 text-sm text-slate-500">
              {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Search */}
      {conversations.length > 0 && (
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="5" />
            <path strokeLinecap="round" d="M11 11l3 3" />
          </svg>
          <input
            type="search"
            placeholder="Search by address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            aria-label="Search conversations"
          />
        </div>
      )}

      {/* List */}
      {conversations.length === 0 ? (
        <EmptyInbox />
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          No conversations match &ldquo;{search}&rdquo;
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Conversations" aria-live="polite">
          {filtered.map((convo) => (
            <ConversationRow
              key={convo.peerAddress}
              convo={convo}
              myAddress={wallet}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
