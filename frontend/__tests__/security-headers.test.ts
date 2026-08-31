import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Security Headers Configuration", () => {
  it("enforces strict Content-Security-Policy and standard security headers", async () => {
    expect(nextConfig.headers).toBeDefined();

    if (typeof nextConfig.headers === "function") {
      const headersConfig = await nextConfig.headers();
      const globalRouteHeaders = headersConfig.find((item) => item.source === "/:path*");

      expect(globalRouteHeaders).toBeDefined();
      const headersMap = new Map(
        globalRouteHeaders?.headers.map((h) => [h.key, h.value]),
      );

      // Verify CSP header presence
      const cspValue =
        headersMap.get("Content-Security-Policy") ||
        headersMap.get("Content-Security-Policy-Report-Only");
      expect(cspValue).toBeDefined();
      expect(cspValue).toContain("default-src 'self'");
      expect(cspValue).toContain("script-src 'self'");
      expect(cspValue).toContain("connect-src");

      // Verify standard security headers
      expect(headersMap.get("X-Content-Type-Options")).toBe("nosniff");
      expect(headersMap.get("X-Frame-Options")).toBe("DENY");
      expect(headersMap.get("Referrer-Policy")).toBe(
        "strict-origin-when-cross-origin",
      );
    }
  });

  it("supports report-only mode via process.env.CSP_REPORT_ONLY", async () => {
    const originalEnv = process.env.CSP_REPORT_ONLY;
    try {
      process.env.CSP_REPORT_ONLY = "true";
      if (typeof nextConfig.headers === "function") {
        const headersConfig = await nextConfig.headers();
        const globalRouteHeaders = headersConfig.find((item) => item.source === "/:path*");
        const headersMap = new Map(
          globalRouteHeaders?.headers.map((h) => [h.key, h.value]),
        );

        expect(headersMap.has("Content-Security-Policy-Report-Only")).toBe(true);
      }
    } finally {
      process.env.CSP_REPORT_ONLY = originalEnv;
    }
  });
});
