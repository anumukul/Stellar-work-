"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PresenceStatus = "online" | "away" | "offline" | "unknown";

const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;
const AWAY_THRESHOLD_MS = 30 * 60 * 1000;
const DEBOUNCE_MS = 30_000;
const PRESENCE_KEY = "sw:presence";
const PRESENCE_DISABLED_KEY = "sw:presence:disabled";

interface PresenceData {
  address: string;
  lastActive: number;
  online: boolean;
}

function getStoredPresence(address: string): PresenceData | null {
  try {
    const raw = localStorage.getItem(`${PRESENCE_KEY}:${address}`);
    if (!raw) return null;
    return JSON.parse(raw) as PresenceData;
  } catch {
    return null;
  }
}

function setStoredPresence(data: PresenceData): void {
  try {
    localStorage.setItem(`${PRESENCE_KEY}:${data.address}`, JSON.stringify(data));
  } catch {
    // storage full or unavailable
  }
}

export function isPresenceDisabled(): boolean {
  try {
    return localStorage.getItem(PRESENCE_DISABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setPresenceDisabled(disabled: boolean): void {
  try {
    if (disabled) {
      localStorage.setItem(PRESENCE_DISABLED_KEY, "true");
    } else {
      localStorage.removeItem(PRESENCE_DISABLED_KEY);
    }
  } catch {
    // ignore
  }
}

export function computeStatus(data: PresenceData | null): PresenceStatus {
  if (!data) return "unknown";
  if (!data.online) return "offline";
  const elapsed = Date.now() - data.lastActive;
  if (elapsed <= ACTIVE_THRESHOLD_MS) return "online";
  if (elapsed <= AWAY_THRESHOLD_MS) return "away";
  return "offline";
}

export function formatLastSeen(data: PresenceData | null): string {
  if (!data || !data.lastActive) return "";
  const elapsed = Date.now() - data.lastActive;
  const mins = Math.floor(elapsed / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function usePresenceTracker(address: string | null): void {
  const lastUpdateRef = useRef(0);

  const updatePresence = useCallback(() => {
    if (!address || isPresenceDisabled()) return;
    const now = Date.now();
    if (now - lastUpdateRef.current < DEBOUNCE_MS) return;
    lastUpdateRef.current = now;
    setStoredPresence({
      address,
      lastActive: now,
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
    });
  }, [address]);

  useEffect(() => {
    if (!address || isPresenceDisabled()) return;
    updatePresence();

    const events = ["click", "keydown", "scroll", "mousemove", "touchstart"];
    const handler = () => updatePresence();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));

    const onlineHandler = () => updatePresence();
    const offlineHandler = () => {
      if (!address) return;
      const stored = getStoredPresence(address);
      if (stored) {
        setStoredPresence({ ...stored, online: false });
      }
    };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
    };
  }, [address, updatePresence]);
}

export function usePresence(address: string | null): {
  status: PresenceStatus;
  lastSeen: string;
} {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!address) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [address]);

  if (!address) return { status: "unknown", lastSeen: "" };
  void tick;
  const data = getStoredPresence(address);
  return { status: computeStatus(data), lastSeen: formatLastSeen(data) };
}
