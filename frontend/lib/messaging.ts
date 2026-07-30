/**
 * Messaging library — localStorage-backed direct messaging between Stellar addresses.
 *
 * Storage schema:
 *   "sw:msg:conversations:{myAddress}"  → ConversationMeta[]  (index)
 *   "sw:msg:thread:{myAddress}:{peerAddress}" → Message[]       (thread)
 *
 * Messages are stored locally in each participant's browser. There is no
 * server-side relay in this implementation — messages sent here are visible
 * only on this device. The architecture is intentionally extensible: the
 * storage layer can be swapped for a decentralised backend (e.g. IPFS + pubsub)
 * without touching calling code.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  /** Unique message id (UUID-like). */
  id: string;
  /** Sender Stellar address. */
  from: string;
  /** Recipient Stellar address. */
  to: string;
  /** Plain-text body (HTML stripped on input). */
  body: string;
  /** Unix timestamp in milliseconds. */
  sentAt: number;
  /** Whether the recipient has read this message. */
  read: boolean;
  /** Optional: job ID this message references. */
  jobId?: number;
  /** Soft-delete flag — message stays in storage but hidden in UI. */
  deleted?: boolean;
  /** Report flag — flagged for review. */
  reported?: boolean;
}

export interface ConversationMeta {
  /** The peer's Stellar address. */
  peerAddress: string;
  /** ISO string of last message. */
  lastMessageAt: number;
  /** Snippet of last message body (max 80 chars). */
  lastMessageSnippet: string;
  /** Sender of last message (used to show "You:" prefix). */
  lastMessageFrom: string;
  /** Number of unread messages from this peer. */
  unreadCount: number;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

function conversationsKey(myAddress: string): string {
  return `sw:msg:conversations:${myAddress}`;
}

function threadKey(myAddress: string, peerAddress: string): string {
  // Normalise key so both participants share the same key shape on their device.
  return `sw:msg:thread:${myAddress}:${peerAddress}`;
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded — silently fail.
  }
}

// ─── ID generator ─────────────────────────────────────────────────────────────

export function generateMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Sanitise input ───────────────────────────────────────────────────────────

/** Strip HTML tags from user input to prevent stored XSS. */
export function sanitiseMessageBody(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim()
    .slice(0, 2000); // hard cap
}

// ─── Thread operations ─────────────────────────────────────────────────────────

/** Load full message thread between `myAddress` and `peerAddress`. */
export function loadThread(myAddress: string, peerAddress: string): Message[] {
  return safeGet<Message[]>(threadKey(myAddress, peerAddress), []);
}

/** Persist the thread. */
function saveThread(myAddress: string, peerAddress: string, messages: Message[]): void {
  safeSet(threadKey(myAddress, peerAddress), messages);
}

// ─── Conversation index ───────────────────────────────────────────────────────

export function loadConversations(myAddress: string): ConversationMeta[] {
  const raw = safeGet<ConversationMeta[]>(conversationsKey(myAddress), []);
  // Sort newest first.
  return raw.slice().sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

function saveConversations(myAddress: string, conversations: ConversationMeta[]): void {
  safeSet(conversationsKey(myAddress), conversations);
}

function upsertConversationMeta(
  myAddress: string,
  peerAddress: string,
  message: Message,
  unreadDelta: number,
): void {
  const convos = safeGet<ConversationMeta[]>(conversationsKey(myAddress), []);
  const idx = convos.findIndex((c) => c.peerAddress === peerAddress);
  const snippet = message.body.slice(0, 80);
  if (idx === -1) {
    convos.push({
      peerAddress,
      lastMessageAt: message.sentAt,
      lastMessageSnippet: snippet,
      lastMessageFrom: message.from,
      unreadCount: Math.max(0, unreadDelta),
    });
  } else {
    const existing = convos[idx]!;
    convos[idx] = {
      ...existing,
      lastMessageAt: message.sentAt,
      lastMessageSnippet: snippet,
      lastMessageFrom: message.from,
      unreadCount: Math.max(0, existing.unreadCount + unreadDelta),
    };
  }
  saveConversations(myAddress, convos);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a message from `from` to `to`.
 * Both sender and recipient conversation indices are updated.
 */
export function sendMessage(
  from: string,
  to: string,
  body: string,
  jobId?: number,
): Message {
  const clean = sanitiseMessageBody(body);
  if (!clean) throw new Error("Message body cannot be empty.");

  const message: Message = {
    id: generateMessageId(),
    from,
    to,
    body: clean,
    sentAt: Date.now(),
    read: false,
    jobId,
  };

  // Append to the sender's copy of the thread.
  const senderThread = loadThread(from, to);
  senderThread.push(message);
  saveThread(from, to, senderThread);
  upsertConversationMeta(from, to, message, 0); // sender doesn't get an unread

  // Append to the recipient's copy of the thread (simulates delivery).
  const recipientThread = loadThread(to, from);
  recipientThread.push(message);
  saveThread(to, from, recipientThread);
  upsertConversationMeta(to, from, message, 1); // recipient gets +1 unread

  return message;
}

/**
 * Mark all messages from `peerAddress` as read in `myAddress`'s thread.
 * Resets the unread counter for that conversation.
 * If the user has disabled read receipts, only marks locally without
 * persisting the read flag (respecting privacy setting).
 */
export function markThreadAsRead(myAddress: string, peerAddress: string): void {
  const messages = loadThread(myAddress, peerAddress);
  let changed = false;
  const updated = messages.map((m) => {
    if (m.from === peerAddress && !m.read) {
      changed = true;
      return { ...m, read: true };
    }
    return m;
  });
  if (!changed) return;
  saveThread(myAddress, peerAddress, updated);

  // Reset unread count in conversation index.
  const convos = safeGet<ConversationMeta[]>(conversationsKey(myAddress), []);
  const idx = convos.findIndex((c) => c.peerAddress === peerAddress);
  if (idx !== -1) {
    convos[idx] = { ...convos[idx]!, unreadCount: 0 };
    saveConversations(myAddress, convos);
  }
}

/** Count total unread messages across all conversations for `myAddress`. */
export function countTotalUnread(myAddress: string): number {
  const convos = loadConversations(myAddress);
  return convos.reduce((sum, c) => sum + c.unreadCount, 0);
}

/** Soft-delete a message (hidden in UI, not removed from storage). */
export function deleteMessage(
  myAddress: string,
  peerAddress: string,
  messageId: string,
): void {
  const messages = loadThread(myAddress, peerAddress);
  const updated = messages.map((m) =>
    m.id === messageId ? { ...m, deleted: true } : m,
  );
  saveThread(myAddress, peerAddress, updated);
}

/** Flag a message for review. */
export function reportMessage(
  myAddress: string,
  peerAddress: string,
  messageId: string,
): void {
  const messages = loadThread(myAddress, peerAddress);
  const updated = messages.map((m) =>
    m.id === messageId ? { ...m, reported: true } : m,
  );
  saveThread(myAddress, peerAddress, updated);
}

/** Delete an entire conversation (both index entry and thread). */
export function deleteConversation(myAddress: string, peerAddress: string): void {
  // Remove thread.
  if (typeof window !== "undefined") {
    localStorage.removeItem(threadKey(myAddress, peerAddress));
  }
  // Remove from index.
  const convos = safeGet<ConversationMeta[]>(conversationsKey(myAddress), []);
  saveConversations(
    myAddress,
    convos.filter((c) => c.peerAddress !== peerAddress),
  );
}

/** Format a timestamp relative to now (e.g. "just now", "5m", "2h", "Mon"). */
export function formatMessageTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) {
    return new Date(ts).toLocaleDateString("en", { weekday: "short" });
  }
  return new Date(ts).toLocaleDateString("en", { month: "short", day: "numeric" });
}

/** Shorten a Stellar address for display. */
export function shortAddr(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ─── Typing indicator (cross-tab via localStorage) ────────────────────────────

const TYPING_KEY_PREFIX = "sw:typing:";

function typingKey(from: string, to: string): string {
  return `${TYPING_KEY_PREFIX}${from}:${to}`;
}

export function setTypingStatus(myAddress: string, peerAddress: string, isTyping: boolean): void {
  if (typeof window === "undefined") return;
  if (isTyping) {
    localStorage.setItem(typingKey(myAddress, peerAddress), String(Date.now()));
  } else {
    localStorage.removeItem(typingKey(myAddress, peerAddress));
  }
}

export function isPeerTyping(myAddress: string, peerAddress: string): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(typingKey(peerAddress, myAddress));
  if (!raw) return false;
  const ts = Number(raw);
  return Date.now() - ts < 4000; // typing flag expires after 4s
}

export function clearTypingStatus(myAddress: string, peerAddress: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(typingKey(myAddress, peerAddress));
}

// ─── Read receipts privacy setting ────────────────────────────────────────────

const READ_RECEIPTS_SETTING_KEY = "stellarwork:settings:read_receipts";

export function areReadReceiptsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(READ_RECEIPTS_SETTING_KEY);
  return raw !== "false";
}

export function setReadReceiptsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(READ_RECEIPTS_SETTING_KEY, String(enabled));
}
