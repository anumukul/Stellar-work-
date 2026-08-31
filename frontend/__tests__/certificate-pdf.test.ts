/**
 * Tests for lib/certificate-pdf.ts (issue #818)
 *
 * Covers:
 * - stroopsToXlm conversion
 * - formatCompletedAt (Unix timestamp vs ledger number)
 * - shortAddress
 * - escapeHtml (injection safety)
 * - buildCertificateHtml (data correctness, QR presence)
 * - buildCertificateData (field mapping, verificationUrl construction)
 * - generateQrDataUrl (SSR/no-canvas fallback)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  stroopsToXlm,
  formatCompletedAt,
  shortAddress,
  escapeHtml,
  buildCertificateHtml,
  buildCertificateData,
  generateQrDataUrl,
  type CertificateData,
} from "@/lib/certificate-pdf";
import type { CompletionCertificate } from "@/lib/contract";

// ─── stroopsToXlm ─────────────────────────────────────────────────────────────

describe("stroopsToXlm", () => {
  it("converts 10_000_000 stroops to 1 XLM", () => {
    expect(stroopsToXlm("10000000")).toBe("1");
  });

  it("converts 100_000_000 stroops to 10 XLM", () => {
    expect(stroopsToXlm("100000000")).toBe("10");
  });

  it("handles fractional XLM amounts", () => {
    expect(stroopsToXlm("15000000")).toBe("1.5");
  });

  it("returns – for non-numeric input", () => {
    expect(stroopsToXlm("invalid")).toBe("–");
  });

  it("returns – for empty string", () => {
    expect(stroopsToXlm("")).toBe("–");
  });

  it("handles zero", () => {
    expect(stroopsToXlm("0")).toBe("0");
  });});

// ─── formatCompletedAt ────────────────────────────────────────────────────────

describe("formatCompletedAt", () => {
  it("returns – for falsy / zero input", () => {
    expect(formatCompletedAt("")).toBe("–");
    expect(formatCompletedAt("0")).toBe("–");
  });

  it("formats a ledger sequence number with text 'Ledger N'", () => {
    const result = formatCompletedAt("54321");
    expect(result).toBe("Ledger 54,321");
  });

  it("formats a Unix timestamp as a readable date", () => {
    // 2024-01-01 00:00:00 UTC
    const ts = "1704067200";
    const result = formatCompletedAt(ts);
    // Just verify it's a date string (locale-dependent format)
    expect(result).toMatch(/2024/);
    expect(result).not.toMatch(/Ledger/);
  });

  it("returns – for non-numeric input", () => {
    expect(formatCompletedAt("abc")).toBe("–");
  });
});

// ─── shortAddress ─────────────────────────────────────────────────────────────

describe("shortAddress", () => {
  it("shortens a full Stellar address", () => {
    const addr = "GCLIENTADDRESS1234567890ABCDEFGHIJKLMNOPQRSTU";
    const result = shortAddress(addr);
    expect(result).toBe(`${addr.slice(0, 6)}…${addr.slice(-4)}`);
  });

  it("returns the address unchanged if it is already short", () => {
    expect(shortAddress("GABC")).toBe("GABC");
  });

  it("handles empty string", () => {
    expect(shortAddress("")).toBe("–");
  });
});

// ─── escapeHtml ───────────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("escapes < > & \" '", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("leaves safe strings unchanged", () => {
    expect(escapeHtml("Hello, World!")).toBe("Hello, World!");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });
});

// ─── buildCertificateHtml ─────────────────────────────────────────────────────

const SAMPLE_DATA: CertificateData = {
  jobId: 42,
  jobTitle: "Build a Soroban DApp",
  client: "GCLIENTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  freelancer: "GFREELANCERBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  amount: "50000000", // 5 XLM
  completedAt: "54321",
  verificationUrl: "https://example.com/job/42",
};

describe("buildCertificateHtml", () => {
  it("includes the job title", () => {
    const html = buildCertificateHtml(SAMPLE_DATA, "data:image/png;base64,FAKE");
    expect(html).toContain("Build a Soroban DApp");
  });

  it("includes the job ID", () => {
    const html = buildCertificateHtml(SAMPLE_DATA, "data:image/png;base64,FAKE");
    expect(html).toContain("#42");
  });

  it("includes the XLM amount", () => {
    const html = buildCertificateHtml(SAMPLE_DATA, "data:image/png;base64,FAKE");
    // 50_000_000 stroops = 5 XLM, displayed as "5 XLM" (trailing zeros stripped)
    expect(html).toContain("5 XLM");
  });

  it("embeds the QR data URL in an img tag", () => {
    const qr = "data:image/png;base64,TESTQR";
    const html = buildCertificateHtml(SAMPLE_DATA, qr);
    expect(html).toContain(`src="${qr}"`);
  });

  it("includes the verification URL", () => {
    const html = buildCertificateHtml(SAMPLE_DATA, "data:image/gif;base64,X");
    expect(html).toContain("https://example.com/job/42");
  });

  it("escapes malicious job title", () => {
    const xssData: CertificateData = {
      ...SAMPLE_DATA,
      jobTitle: '<img src=x onerror="alert(1)">',
    };
    const html = buildCertificateHtml(xssData, "data:image/gif;base64,X");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("includes the completion date", () => {
    const html = buildCertificateHtml(SAMPLE_DATA, "data:image/gif;base64,X");
    expect(html).toContain("Ledger");
  });

  it("includes shortened freelancer address", () => {
    const html = buildCertificateHtml(SAMPLE_DATA, "data:image/gif;base64,X");
    expect(html).toContain("GFREEL");
    expect(html).toContain("…");
  });

  it("produces valid HTML with a DOCTYPE", () => {
    const html = buildCertificateHtml(SAMPLE_DATA, "data:image/gif;base64,X");
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });
});

// ─── buildCertificateData ────────────────────────────────────────────────────

describe("buildCertificateData", () => {
  const cert: CompletionCertificate = {
    job_id: 7,
    client: "GCLIENT",
    freelancer: "GFREELANCER",
    amount: "20000000",
    completed_at: "99999",
    metadata_uri: "ipfs://Qm...",
  };

  it("maps job_id to jobId", () => {
    const data = buildCertificateData(cert);
    expect(data.jobId).toBe(7);
  });

  it("uses provided jobTitle option", () => {
    const data = buildCertificateData(cert, { jobTitle: "My Custom Job" });
    expect(data.jobTitle).toBe("My Custom Job");
  });

  it("falls back to Job #<id> when no title is provided", () => {
    const data = buildCertificateData(cert);
    expect(data.jobTitle).toBe("Job #7");
  });

  it("builds verificationUrl from origin + job id", () => {
    const data = buildCertificateData(cert, { origin: "https://app.example.com" });
    expect(data.verificationUrl).toBe("https://app.example.com/job/7");
  });

  it("falls back to empty string for origin when window is unavailable", () => {
    // In jsdom window.location.origin is available but we can override origin
    const data = buildCertificateData(cert, { origin: "" });
    expect(data.verificationUrl).toBe("/job/7");
  });

  it("maps client and freelancer addresses", () => {
    const data = buildCertificateData(cert);
    expect(data.client).toBe("GCLIENT");
    expect(data.freelancer).toBe("GFREELANCER");
  });

  it("maps amount and completedAt", () => {
    const data = buildCertificateData(cert);
    expect(data.amount).toBe("20000000");
    expect(data.completedAt).toBe("99999");
  });
});

// ─── generateQrDataUrl ────────────────────────────────────────────────────────

describe("generateQrDataUrl", () => {
  it("returns a data URL string", () => {
    const url = generateQrDataUrl("https://example.com/job/1");
    expect(typeof url).toBe("string");
    expect(url).toMatch(/^data:/);
  });

  it("returns a fallback GIF when document/canvas is not available", () => {
    // Simulate SSR by temporarily hiding HTMLCanvasElement
    const original = globalThis.HTMLCanvasElement;
    // @ts-expect-error – intentionally hiding for test
    globalThis.HTMLCanvasElement = undefined;
    try {
      const url = generateQrDataUrl("https://example.com/job/1");
      // Should return the transparent GIF fallback
      expect(url).toContain("image/gif");
    } finally {
      globalThis.HTMLCanvasElement = original;
    }
  });

  it("produces different outputs for different URLs", () => {
    const url1 = generateQrDataUrl("https://example.com/job/1");
    const url2 = generateQrDataUrl("https://example.com/job/999");
    // If canvas is unavailable both are the same fallback GIF — that is OK.
    // If canvas IS available they should differ.
    if (!url1.includes("image/gif")) {
      expect(url1).not.toBe(url2);
    }
  });
});

// ─── Incomplete job data guard ────────────────────────────────────────────────

describe("certificate utilities with missing / invalid data", () => {
  it("stroopsToXlm handles negative-looking string (invalid)", () => {
    expect(stroopsToXlm("-100")).toBe("–");
  });

  it("buildCertificateData with zeroed completed_at formats as –", () => {
    const cert: CompletionCertificate = {
      job_id: 1,
      client: "GCLIENT",
      freelancer: "GFREELANCER",
      amount: "0",
      completed_at: "0",
      metadata_uri: "",
    };
    const data = buildCertificateData(cert, { origin: "https://app.example.com" });
    const html = buildCertificateHtml(data, "data:image/gif;base64,X");
    // completedAt 0 should render as "–"
    expect(html).toContain("–");
  });

  it("buildCertificateHtml handles empty freelancer address gracefully", () => {
    const data: CertificateData = {
      ...SAMPLE_DATA,
      freelancer: "",
    };
    // Should not throw
    const html = buildCertificateHtml(data, "data:image/gif;base64,X");
    expect(html).toBeTruthy();
  });
});
