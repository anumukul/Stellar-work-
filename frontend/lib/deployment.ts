/**
 * Deployment environment utilities.
 *
 * Vercel injects several environment variables automatically:
 *   VERCEL            — "1" on all Vercel deployments
 *   VERCEL_ENV        — "production" | "preview" | "development"
 *   VERCEL_URL        — The deployment URL (without https://)
 *   VERCEL_GIT_COMMIT_SHA — The full SHA of the triggering commit
 *   VERCEL_GIT_COMMIT_REF — The branch or tag name
 *
 * These are server-side only. For browser access, mirror them via
 * NEXT_PUBLIC_ prefixed variables in the Vercel dashboard.
 */

export type DeploymentEnvironment = "production" | "preview" | "development" | "local";

/**


 * - "preview"     — PR or branch preview deployment on Vercel
 * - "development" — running locally via `vercel dev`
 * - "local"       — running locally via `npm run dev`
 */
export function getDeploymentEnvironment(): DeploymentEnvironment {
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV;

  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "development") return "development";

  return "local";
}

/**
 * Returns true when running on any Vercel deployment (production or preview).
 */
export function isVercel(): boolean {
  return (
    process.env.NEXT_PUBLIC_VERCEL === "1" ||
    process.env.VERCEL === "1"
  );
}

/**
 * Returns true only for Vercel production deployments (main branch).
 */
export function isProduction(): boolean {
  return getDeploymentEnvironment() === "production";
}

/**
 * Returns true for Vercel PR / branch preview deployments.
 */
export function isPreview(): boolean {
  return getDeploymentEnvironment() === "preview";
}

/**
 * Returns the deployment URL with scheme.
 * Falls back to localhost:3000 for local development.
 */
export function getDeploymentUrl(): string {
  const vercelUrl =
    process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;

  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "http://localhost:3000";
}

/**
 * Returns the short Git commit SHA for the current deployment.
 * Returns null when not running on Vercel.
 */
export function getCommitSha(): string | null {
  const sha =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    null;

  return sha ? sha.slice(0, 7) : null;
}

/**
 * Returns the Git branch or tag name for the current deployment.
 * Returns null when not running on Vercel.
 */
export function getCommitRef(): string | null {
  return (
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ??
    process.env.VERCEL_GIT_COMMIT_REF ??
    null
  );
}
