"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { useMessaging } from "@/lib/messaging-context";
import CallButton from "@/components/CallButton";
import CallHistory from "@/components/CallHistory";
import Spinner from "@/components/Spinner";
import TruncatedAddress from "@/components/TruncatedAddress";
import {
  loadThread,
  sendMessage,
  markThreadAsRead,
  deleteMessage,
  reportMessage,
  formatMessageTime,
  shortAddr,
  sanitiseMessageBody,
  setTypingStatus,
  isPeerTyping,
  clearTypingStatus,
  areReadReceiptsEnabled,
  type Message,
} from "@/lib/messaging";

const MAX_BODY_LEN = 2000;
const TYPING_TIMEOUT_MS = 3000;
const POLL_MS = 3000; // Poll for new messages from localStorage (cross-tab)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidStellarAddress(addr: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(addr);
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isMine,
  onDelete,
  onReport,
}: {
  message: Message;
  isMine: boolean;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  if (message.deleted) {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
        <p className="max-w-xs rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs italic text-slate-400">
          Message deleted
        </p>
      </div>
    );
  }

  return (
    <div
      className={`group flex items-end gap-1.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowMenu(false); }}
    >
      {/* Bubble */}
      <div
        className={`relative max-w-[72%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
          isMine
            ? "rounded-br-sm bg-slate-900 text-white"
            : "rounded-bl-sm bg-white ring-1 ring-slate-200 text-slate-900"
        }`}
      >
        {message.reported && (
          <span className="mb-1 block text-[10px] font-medium text-amber-400">
            ⚑ Reported
          </span>
        )}
        <p className="break-words whitespace-pre-wrap">{message.body}</p>
        {message.jobId && (
          <Link
            href={`/job/${message.jobId}`}
            className={`mt-1 block text-[10px] underline underline-offset-2 ${isMine ? "text-slate-300" : "text-blue-500"}`}
          >
            Re: Job #{message.jobId}
          </Link>
        )}
        <div className={`mt-1 flex items-center gap-1 ${isMine ? "justify-end" : "justify-start"}`}>
          <span className={`text-[10px] ${isMine ? "text-slate-400" : "text-slate-400"}`}>
            {formatMessageTime(message.sentAt)}
          </span>
          {isMine && (
            <span className="text-[10px] text-slate-400" aria-label={message.read ? "Read" : "Sent"}>
              {message.read ? "\u2713\u2713" : "\u2713"}
            </span>
          )}
        </div>
      </div>

      {/* Action button */}
      {(showActions || showMenu) && (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Message options"
            aria-expanded={showMenu}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="8" cy="3.5" r="1.2" />
              <circle cx="8" cy="8" r="1.2" />
              <circle cx="8" cy="12.5" r="1.2" />
            </svg>
          </button>

          {showMenu && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10"
                aria-hidden="true"
                onClick={() => setShowMenu(false)}
                tabIndex={-1}
              />
              <div
                className={`absolute bottom-7 z-20 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${isMine ? "right-0" : "left-0"}`}
              >
                {isMine ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                    onClick={() => { setShowMenu(false); onDelete(message.id); }}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                      <path strokeLinecap="round" d="M2 2l8 8M10 2l-8 8" />
                    </svg>
                    Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-amber-600 hover:bg-amber-50"
                    onClick={() => { setShowMenu(false); onReport(message.id); }}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 1v6M6 9v1" />
                    </svg>
                    Report
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label="Peer is typing">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-slate-200">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: `${delay}ms`, animationDuration: "900ms" }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Day separator ────────────────────────────────────────────────────────────

function DaySeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 border-t border-slate-200" />
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {date}
      </span>
      <div className="flex-1 border-t border-slate-200" />
    </div>
  );
}

function formatDay(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConversationPage() {
  const params = useParams<{ address: string }>();
  const peerAddress = params.address;
  const { wallet, connectWallet } = useWallet();
  const { refreshUnread } = useMessaging();

  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [isTyping, setIsTyping] = useState(false); // simulated indicator
  const [peerIsTyping, setPeerIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isValidPeer = isValidStellarAddress(peerAddress);

  // ── Load & mark read ──────────────────────────────────────────────────────

  const loadMessages = useCallback(() => {
    if (!wallet || !isValidPeer) return;
    const thread = loadThread(wallet, peerAddress);
    setMessages(thread);
    markThreadAsRead(wallet, peerAddress);
    refreshUnread();
  }, [wallet, peerAddress, isValidPeer, refreshUnread]);

  useEffect(() => {
    loadMessages();

    // Poll for new messages written by the other side (cross-tab / future relay).
    pollRef.current = setInterval(loadMessages, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadMessages]);

  // Also update on storage events from other tabs.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key?.includes(peerAddress)) loadMessages();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [peerAddress, loadMessages]);

  // Scroll to bottom on new messages.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Typing indicator logic ────────────────────────────────────────────────

  function handleBodyChange(value: string) {
    setBody(value);
    if (!isTyping && wallet) {
      setTypingStatus(wallet, peerAddress, true);
    }
    setIsTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setIsTyping(false);
      if (wallet) setTypingStatus(wallet, peerAddress, false);
    }, TYPING_TIMEOUT_MS);
  }

  // Poll for peer typing status
  useEffect(() => {
    if (!wallet) return;
    const checkTyping = () => setPeerIsTyping(isPeerTyping(wallet, peerAddress));
    checkTyping();
    const id = setInterval(checkTyping, 2000);
    return () => clearInterval(id);
  }, [wallet, peerAddress]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (wallet) clearTypingStatus(wallet, peerAddress);
    };
  }, [wallet, peerAddress]);

  // ── Send ───────────────────────────────────────────────────────────────────

  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    if (!wallet || !body.trim() || sending) return;
    const clean = sanitiseMessageBody(body);
    if (!clean) return;

    setSending(true);
    setError("");
    try {
      sendMessage(wallet, peerAddress, clean);
      setBody("");
      loadMessages();
      textareaRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+Enter or Cmd+Enter to send
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSend();
    }
  }

  // ── Delete / report ────────────────────────────────────────────────────────

  function handleDelete(messageId: string) {
    if (!wallet) return;
    deleteMessage(wallet, peerAddress, messageId);
    loadMessages();
  }

  function handleReport(messageId: string) {
    if (!wallet) return;
    reportMessage(wallet, peerAddress, messageId);
    loadMessages();
  }

  // ── Group messages by day ─────────────────────────────────────────────────

  interface DayGroup {
    label: string;
    messages: Message[];
  }

  const dayGroups: DayGroup[] = [];
  for (const msg of messages) {
    const label = formatDay(msg.sentAt);
    if (dayGroups.length === 0 || dayGroups[dayGroups.length - 1]!.label !== label) {
      dayGroups.push({ label, messages: [msg] });
    } else {
      dayGroups[dayGroups.length - 1]!.messages.push(msg);
    }
  }

  // ── Invalid address ────────────────────────────────────────────────────────

  if (!isValidPeer) {
    return (
      <section className="mx-auto max-w-2xl space-y-4">
        <Link href="/messages" className="text-sm text-blue-600 hover:underline">
          ← Back to Messages
        </Link>
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          Invalid Stellar address in the URL.
        </p>
      </section>
    );
  }

  // ── No wallet ─────────────────────────────────────────────────────────────

  if (!wallet) {
    return (
      <section className="mx-auto max-w-2xl space-y-4">
        <Link href="/messages" className="text-sm text-blue-600 hover:underline">
          ← Back to Messages
        </Link>
        <h1 className="text-2xl font-semibold">Messages</h1>
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-center">
          <p className="text-sm text-slate-600">Connect your wallet to send and receive messages.</p>
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

  const remaining = MAX_BODY_LEN - body.length;
  const isOverLimit = remaining < 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="mx-auto flex max-w-2xl flex-col" style={{ height: "calc(100vh - 9rem)" }}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white pb-3">
        <Link
          href="/messages"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label="Back to inbox"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 3L5 8l5 5" />
          </svg>
        </Link>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-300 to-slate-500 text-sm font-bold text-white select-none" aria-hidden="true">
          {peerAddress.slice(1, 3).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-mono text-sm font-semibold text-slate-900">
            <Link
              href={`/profile/${peerAddress}`}
              className="hover:underline"
              title={peerAddress}
            >
              {shortAddr(peerAddress)}
            </Link>
          </h1>
          <Link
            href={`/profile/${peerAddress}`}
            className="block truncate font-mono text-sm font-semibold text-slate-900 hover:underline"
          >
            <TruncatedAddress
              address={peerAddress}
              className="font-mono text-sm font-semibold text-slate-900"
              focusable={false}
            />
          </Link>
          <p className="truncate text-[10px] text-slate-400">{peerAddress}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <CallButton myAddress={wallet} peerAddress={peerAddress} variant="voice" size="sm" />
          <CallButton myAddress={wallet} peerAddress={peerAddress} variant="video" size="sm" />
          <Link
            href={`/profile/${peerAddress}`}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            View Profile
          </Link>
        </div>
      </div>
      <CallHistory peerAddress={peerAddress} />

      {/* Message list */}
      <div
        className="flex-1 overflow-y-auto py-4"
        role="log"
        aria-label="Message thread"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-700">Start the conversation</p>
            <p className="mt-1 text-xs text-slate-400">Send a message to {shortAddr(peerAddress)}</p>
          </div>
        ) : (
          <div className="space-y-1 px-1">
            {dayGroups.map((group) => (
              <div key={group.label}>
                <DaySeparator date={group.label} />
                <div className="space-y-1.5">
                  {group.messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isMine={msg.from === wallet}
                      onDelete={handleDelete}
                      onReport={handleReport}
                    />
                  ))}
                </div>
              </div>
            ))}

            {peerIsTyping && <TypingIndicator />}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <p className="shrink-0 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* Compose box */}
      <form
        onSubmit={(e) => void handleSend(e)}
        className="shrink-0 border-t border-slate-200 bg-white pt-3"
        aria-label="Compose message"
      >
        <div className={`flex items-end gap-2 rounded-xl border ${isOverLimit ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"} px-3 py-2 transition-colors focus-within:border-slate-400`}>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Ctrl+Enter to send)"
            rows={1}
            maxLength={MAX_BODY_LEN + 50} // soft warn before hard cut
            className="max-h-32 min-h-[2rem] flex-1 resize-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            aria-label="Message body"
            aria-describedby="msg-char-count"
            disabled={sending}
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <div className="flex shrink-0 items-center gap-2">
            <span
              id="msg-char-count"
              className={`text-[10px] tabular-nums ${isOverLimit ? "font-semibold text-red-600" : "text-slate-400"}`}
              aria-live="polite"
            >
              {remaining}
            </span>
            <button
              type="submit"
              disabled={sending || !body.trim() || isOverLimit}
              aria-label="Send message"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {sending ? (
                <Spinner size={14} color="currentColor" label="Sending message" />
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M2.293 13.707a1 1 0 010-1.414L10.586 4H6a1 1 0 110-2h7a1 1 0 011 1v7a1 1 0 11-2 0V5.414l-8.293 8.293a1 1 0 01-1.414 0z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <p className="mt-1 text-right text-[10px] text-slate-400">
          Messages are stored locally on this device.
        </p>
      </form>
    </section>
  );
}
