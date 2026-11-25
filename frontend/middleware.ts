import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const handleI18n = createMiddleware(routing);

export default function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isReportOnly = process.env.CSP_REPORT_ONLY === "true";
  const cspHeaderKey = isReportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://horizon-testnet.stellar.org https://soroban-testnet.stellar.org https://horizon.stellar.org https://rpc-futurenet.stellar.org https://ipfs.io https://*.pinata.cloud https://*.nftstorage.link wss: https: https://*.sentry.io https://o*.ingest.sentry.io",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(cspHeaderKey, cspDirectives);

  const response = handleI18n(
    new NextRequest(request.url, {
      headers: requestHeaders,
    }),
  );

  response.headers.set(cspHeaderKey, cspDirectives);
  response.headers.set("x-nonce", nonce);
  return response;
}

export const config = {
  
  matcher: ["/((?!sentry-tunnel|_next|api|favicon.ico|.*\\..*).*)"],
};
