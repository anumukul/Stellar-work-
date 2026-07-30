"use client";

import DOMPurify from "dompurify";

// ─── Constants ─────────────────────────────────────────────────────────────────

export const MAX_DESCRIPTION_BYTES = 4096;
export const MAX_MESSAGE_BODY_LEN = 2000;
export const MAX_BIO_LENGTH = 600;
export const MAX_SKILLS = 20;
export const MAX_LINKS = 5;
export const MAX_HIGHLIGHTS = 6;
export const MAX_TESTIMONIAL_LENGTH = 500;
export const MAX_MEETING_TITLE_LEN = 200;
export const MAX_ANNOUNCEMENT_MSG_LEN = 5000;
export const MAX_DISPUTE_REASON_LEN = 2000;
export const MAX_DISPUTE_EVIDENCE_LEN = 5000;
export const MAX_RESOLUTION_NOTE_LEN = 2000;
export const MAX_NAME_LEN = 100;
export const MAX_TAGLINE_LEN = 200;
export const MAX_LOCATION_LEN = 200;
export const MAX_LANGUAGES_LEN = 200;
export const MAX_EXPERIENCE_TITLE_LEN = 200;
export const MAX_EXPERIENCE_COMPANY_LEN = 200;
export const MAX_EXPERIENCE_DESC_LEN = 2000;
export const MAX_EDUCATION_DEGREE_LEN = 200;
export const MAX_EDUCATION_INSTITUTION_LEN = 200;
export const MAX_SKILL_NAME_LEN = 100;
export const MAX_STROOPS = BigInt("9223372036854775807"); // i128 max
export const MIN_JOB_AMOUNT_STROOPS = BigInt("5000000"); // 0.5 XLM
export const MIN_DEADLINE_DAYS = 0;
export const MAX_DEADLINE_DAYS = 365;

// ─── Plain text sanitization ───────────────────────────────────────────────────

export function sanitizePlainText(raw: string, maxLength = 2000): string {
  if (typeof raw !== "string") return "";
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
    .slice(0, maxLength);
}

export function sanitizeRichText(raw: string): string {
  if (typeof raw !== "string") return "";
  if (typeof window === "undefined") {
    return raw.replace(/<[^>]+>/g, "");
  }
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "p", "br",
      "strong", "em", "b", "i",
      "h1", "h2", "h3",
      "ul", "ol", "li",
      "a",
      "img",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "class",
      "src", "alt", "title", "width", "height",
    ],
    FORCE_BODY: true,
  });
}

// ─── Stellar address validation ────────────────────────────────────────────────

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export function validateStellarAddress(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  if (!STELLAR_ADDRESS_RE.test(trimmed)) return null;
  return trimmed;
}

export function sanitizeStellarAddress(raw: string): string {
  return validateStellarAddress(raw) ?? "";
}

// ─── Amount validation ─────────────────────────────────────────────────────────

export interface AmountValidationResult {
  stroops: string | null;
  error: string | null;
}

export function validateAmount(raw: string): AmountValidationResult {
  if (typeof raw !== "string") {
    return { stroops: null, error: "Invalid amount." };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { stroops: null, error: "Amount is required." };
  }
  const amountPattern = /^\d+(\.\d+)?$/;
  if (!amountPattern.test(trimmed)) {
    return { stroops: null, error: "Enter a valid number with up to 7 decimal places." };
  }
  const [, fractional = ""] = trimmed.split(".");
  if (fractional.length > 7) {
    return { stroops: null, error: "Maximum 7 decimal places (smallest unit is 0.0000001 XLM)." };
  }
  const [whole = "0"] = trimmed.split(".");
  const stroops = `${whole}${fractional.padEnd(7, "0")}`;
  try {
    const amountBigInt = BigInt(stroops);
    if (amountBigInt <= 0n) {
      return { stroops: null, error: "Amount must be greater than 0." };
    }
    if (amountBigInt > MAX_STROOPS) {
      return { stroops: null, error: "Amount exceeds maximum allowed value." };
    }
    return { stroops, error: null };
  } catch {
    return { stroops: null, error: "Invalid amount — overflow or malformed value." };
  }
}

export function validateAmountMin(rawStroops: string, minStroops: bigint, label: string): string | null {
  try {
    if (BigInt(rawStroops) < minStroops) {
      return `Minimum ${label} is ${Number(minStroops) / 10_000_000} to prevent dust spam.`;
    }
    return null;
  } catch {
    return "Invalid amount.";
  }
}

// ─── Deadline validation ───────────────────────────────────────────────────────

export function validateDeadline(raw: string): string | null {
  if (typeof raw !== "string") return "Invalid deadline.";
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return "Invalid date format.";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed <= today) {
    return "Deadline cannot be in the past.";
  }
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + MAX_DEADLINE_DAYS);
  if (parsed > maxDate) {
    return `Deadline cannot be more than ${MAX_DEADLINE_DAYS} days from now.`;
  }
  return null;
}

export function sanitizeDeadline(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// ─── URL sanitization ──────────────────────────────────────────────────────────

export function sanitizeUrl(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.href;
  } catch {
    return "";
  }
}

// ─── Hex validation (for description hashes) ───────────────────────────────────

export function validateHex(raw: string, expectedLength?: number): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]*$/.test(normalized)) return null;
  if (normalized.length % 2 !== 0) return null;
  if (expectedLength !== undefined && normalized.length !== expectedLength) return null;
  return normalized.toLowerCase();
}

// ─── Generic input length validation ──────────────────────────────────────────

export function validateLength(raw: string, max: number, fieldName: string): string | null {
  if (typeof raw !== "string") return `${fieldName} is invalid.`;
  const len = new TextEncoder().encode(raw).length;
  if (len > max) {
    return `${fieldName} must be at most ${max} bytes (currently ${len}).`;
  }
  return null;
}

export function sanitizeWithLength(raw: string, maxLength: number): string {
  return sanitizePlainText(raw, maxLength);
}

// ─── Meeting title sanitization ────────────────────────────────────────────────

export function sanitizeMeetingTitle(raw: string): string {
  return sanitizePlainText(raw, MAX_MEETING_TITLE_LEN);
}

// ─── Announcement message sanitization (HTML with DOMPurify) ───────────────────

export function sanitizeAnnouncementMessage(raw: string): string {
  if (typeof raw !== "string") return "";
  if (typeof window === "undefined") return raw.replace(/<[^>]+>/g, "").slice(0, MAX_ANNOUNCEMENT_MSG_LEN);
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "b", "i",
      "h1", "h2", "h3", "ul", "ol", "li",
      "a", "span",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
    FORCE_BODY: true,
  }).slice(0, MAX_ANNOUNCEMENT_MSG_LEN);
}

// ─── Stellar contract address validation ───────────────────────────────────────

export function validateTokenAddress(raw: string): string | null {
  const addr = validateStellarAddress(raw);
  if (!addr) return "Token address must be a valid Stellar contract address (G...).";
  return null;
}
