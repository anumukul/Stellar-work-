import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withBundleAnalyzer from "@next/bundle-analyzer";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "0.1.0",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_COMMIT_SHA: process.env.COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_DEPLOY_ENV: process.env.DEPLOY_ENV ?? process.env.VERCEL_ENV ?? "development",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    dangerouslyAllowSVG: true,
  },
  headers: async () => {
    const isReportOnly = process.env.CSP_REPORT_ONLY === "true";
    const cspHeaderKey = isReportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";

    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://horizon-testnet.stellar.org https://soroban-testnet.stellar.org https://horizon.stellar.org https://rpc-futurenet.stellar.org https://ipfs.io https://*.pinata.cloud https://*.nftstorage.link wss: https:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: cspHeaderKey, value: cspDirectives },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})(withNextIntl(nextConfig));
