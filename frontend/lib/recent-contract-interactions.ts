"use client";

export type RecentInteractionStatus = "SUCCESS" | "ERROR" | "PENDING";

export interface RecentContractInteraction {
  hash: string;
  status: RecentInteractionStatus;
  timestamp: number;
  method: string;
}

const STORAGE_KEY = "stellarwork:recent-contract-interactions";
const EVENT_NAME = "stellarwork:recent-contract-interactions-updated";
const MAX_RECENT = 5;

function saveRecentContractInteractions(items: RecentContractInteraction[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    // Ignore storage quota errors.
  }
}

function emitUpdatedEvent(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function getRecentContractInteractionsEventName(): string {
  return EVENT_NAME;
}

export function loadRecentContractInteractions(): RecentContractInteraction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is RecentContractInteraction => {
        return (
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as RecentContractInteraction).hash === "string" &&
          typeof (entry as RecentContractInteraction).method === "string" &&
          typeof (entry as RecentContractInteraction).timestamp === "number" &&
          ((entry as RecentContractInteraction).status === "SUCCESS" ||
            (entry as RecentContractInteraction).status === "ERROR" ||
            (entry as RecentContractInteraction).status === "PENDING")
        );
      })
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function recordRecentContractInteraction(
  interaction: RecentContractInteraction,
): void {
  if (!interaction.hash) return;

  const existing = loadRecentContractInteractions();
  const withoutSameHash = existing.filter((entry) => entry.hash !== interaction.hash);
  const next = [interaction, ...withoutSameHash].slice(0, MAX_RECENT);

  saveRecentContractInteractions(next);
  emitUpdatedEvent();
}
