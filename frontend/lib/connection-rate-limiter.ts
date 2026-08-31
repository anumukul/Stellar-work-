"use client";

const RATE_LIMIT_STORAGE_KEY = "stellarwork:wallet-connection-attempts";

interface ConnectionAttemptState {
  failures: number;
  lastAttemptTime: number;
  backoffUntil: number;
}

function loadState(): ConnectionAttemptState {
  if (typeof window === "undefined") {
    return { failures: 0, lastAttemptTime: 0, backoffUntil: 0 };
  }
  try {
    const raw = sessionStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    if (!raw) return { failures: 0, lastAttemptTime: 0, backoffUntil: 0 };
    return JSON.parse(raw) as ConnectionAttemptState;
  } catch {
    return { failures: 0, lastAttemptTime: 0, backoffUntil: 0 };
  }
}

function saveState(state: ConnectionAttemptState): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function checkConnectionRateLimit(): void {
  const state = loadState();
  const now = Date.now();

  if (now < state.backoffUntil) {
    const remainingSeconds = Math.ceil((state.backoffUntil - now) / 1000);
    throw new Error(`Too many connection attempts. Please try again in ${remainingSeconds} seconds.`);
  }

  if (state.failures >= 3) {
    // CAPTCHA simulation
    const num1 = Math.floor(Math.random() * 10);
    const num2 = Math.floor(Math.random() * 10);
    const answer = prompt(`Too many failed attempts. Please solve to continue: ${num1} + ${num2} = ?`);
    if (answer !== String(num1 + num2)) {
      throw new Error("CAPTCHA failed. Connection blocked.");
    }
  }
}

export function recordConnectionSuccess(): void {
  saveState({ failures: 0, lastAttemptTime: Date.now(), backoffUntil: 0 });
}

export function recordConnectionFailure(): void {
  const state = loadState();
  const now = Date.now();
  
  const newFailures = state.failures + 1;
  const baseBackoff = 2000; // 2 seconds
  const backoffDuration = baseBackoff * Math.pow(2, newFailures - 1);
  const backoffUntil = now + backoffDuration;

  if (newFailures > 5) {
    console.warn(`[Suspicious Activity] ${newFailures} failed wallet connection attempts detected in this session.`);
  }

  if (newFailures > 10) {
    console.error(`ADMIN ALERT: Potential abuse detected. ${newFailures} failed wallet connection attempts.`);
    // Here we could trigger a real backend alert
  }

  saveState({
    failures: newFailures,
    lastAttemptTime: now,
    backoffUntil,
  });
}
