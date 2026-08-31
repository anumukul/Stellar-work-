const VIEW_STORAGE_PREFIX = "stellarwork:viewed:";

function getStorageKey(jobId: string, wallet: string): string {
  return `${VIEW_STORAGE_PREFIX}${wallet}:${jobId}`;
}

function getSessionKey(jobId: string): string {
  return `stellarwork:session-view:${jobId}`;
}

export function hasViewedToday(jobId: string, wallet: string): boolean {
  if (typeof window === "undefined") return true;
  const key = getStorageKey(jobId, wallet);
  const stored = localStorage.getItem(key);
  if (!stored) return false;
  const timestamp = Number(stored);
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Date.now() - timestamp < oneDayMs;
}

export function markViewed(jobId: string, wallet: string): void {
  if (typeof window === "undefined") return;
  const key = getStorageKey(jobId, wallet);
  localStorage.setItem(key, String(Date.now()));
}

export function hasViewedThisSession(jobId: string): boolean {
  if (typeof window === "undefined") return true;
  return sessionStorage.getItem(getSessionKey(jobId)) === "1";
}

export function markSessionViewed(jobId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(getSessionKey(jobId), "1");
}
