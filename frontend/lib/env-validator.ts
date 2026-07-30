/**
 * Build-time environment variable validation.
 *
 * Called from next.config.ts to fail early when required env vars
 * are missing or malformed.
 *
 * Only NEXT_PUBLIC_* variables are available to the browser bundle,
 * so we validate the NEXT_PUBLIC_ prefixed aliases. Server-only vars
 * like SOROBAN_RPC are checked through their NEXT_PUBLIC_ equivalents.
 */

const VALID_NETWORKS = ["testnet", "futurenet", "mainnet"] as const;

const SOROBAN_RPC_PATTERN = /^https?:\/\/.+/;

/**
 * Stellar contract IDs are Stellar public keys starting with "C"
 * (or possibly "G" for older formats). Validate basic format: 56
 * uppercase alphanumeric characters starting with C.
 */
const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Resolve the effective contract ID from network-specific env vars
 * or the fallback NEXT_PUBLIC_CONTRACT_ID.
 */
function resolveContractId(): string {
  return (
    process.env.NEXT_PUBLIC_CONTRACT_ID_TESTNET ??
    process.env.NEXT_PUBLIC_CONTRACT_ID_FUTURENET ??
    process.env.NEXT_PUBLIC_CONTRACT_ID_MAINNET ??
    process.env.NEXT_PUBLIC_CONTRACT_ID ??
    ""
  );
}

/**
 * Resolve the effective Soroban RPC URL from network-specific env vars
 * or the fallback NEXT_PUBLIC_SOROBAN_RPC.
 */
function resolveSorobanRpc(): string {
  return (
    process.env.NEXT_PUBLIC_SOROBAN_RPC_TESTNET ??
    process.env.NEXT_PUBLIC_SOROBAN_RPC_FUTURENET ??
    process.env.NEXT_PUBLIC_SOROBAN_RPC_MAINNET ??
    process.env.NEXT_PUBLIC_SOROBAN_RPC ??
    ""
  );
}

/**
 * Resolve the network name.
 */
function resolveNetwork(): string {
  return (process.env.NEXT_PUBLIC_NETWORK ?? "testnet").toLowerCase();
}

export function validateEnv(): EnvValidationResult {
  const errors: string[] = [];

  // ── NEXT_PUBLIC_CONTRACT_ID ──────────────────────────────────────────
  const contractId = resolveContractId();
  if (!contractId) {
    errors.push(
      "NEXT_PUBLIC_CONTRACT_ID is required. " +
        "Set it (or a network-specific variant like NEXT_PUBLIC_CONTRACT_ID_TESTNET) " +
        "to the deployed escrow contract ID (starts with 'C', 56 chars).",
    );
  } else if (!CONTRACT_ID_PATTERN.test(contractId)) {
    errors.push(
      `NEXT_PUBLIC_CONTRACT_ID ("${contractId}") does not look like a valid Stellar contract ID. ` +
        "Expected a 56-character string starting with 'C'.",
    );
  }

  // ── NEXT_PUBLIC_NETWORK ──────────────────────────────────────────────
  const network = resolveNetwork();
  if (!network) {
    errors.push("NEXT_PUBLIC_NETWORK is required. Set it to \"testnet\", \"futurenet\", or \"mainnet\".");
  } else if (!VALID_NETWORKS.includes(network as typeof VALID_NETWORKS[number])) {
    errors.push(
      `NEXT_PUBLIC_NETWORK="${network}" is not recognized. ` +
        `Valid values: ${VALID_NETWORKS.join(", ")}.`,
    );
  }

  // ── NEXT_PUBLIC_SOROBAN_RPC ──────────────────────────────────────────
  const sorobanRpc = resolveSorobanRpc();
  if (!sorobanRpc) {
    errors.push(
      "NEXT_PUBLIC_SOROBAN_RPC is required. " +
        "Set it (or a network-specific variant like NEXT_PUBLIC_SOROBAN_RPC_TESTNET) " +
        "to the Soroban RPC endpoint URL.",
    );
  } else if (!SOROBAN_RPC_PATTERN.test(sorobanRpc)) {
    errors.push(
      `NEXT_PUBLIC_SOROBAN_RPC ("${sorobanRpc}") does not look like a valid URL. ` +
        "Expected a URL starting with http:// or https://.",
    );
  }

  // ── Cross-field consistency ──────────────────────────────────────────
  if (network === "mainnet" && sorobanRpc && sorobanRpc.includes("testnet")) {
    errors.push(
      `NEXT_PUBLIC_NETWORK is "mainnet" but NEXT_PUBLIC_SOROBAN_RPC "${sorobanRpc}" ` +
        "points to a testnet endpoint. Verify the RPC URL matches the network.",
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Run validation and log results. Throws on errors so the build fails.
 * Logs warnings for non-fatal issues.
 */
export function assertEnv(): void {
  const { valid, errors } = validateEnv();

  for (const err of errors) {
    console.error(`[env-validator] ❌ ${err}`);
  }

  if (!valid) {
    console.error(
      `\n[env-validator] ${errors.length} environment variable error(s) found. ` +
        "Fix them before building. See .env.example for reference.\n",
    );
    throw new Error("Environment variable validation failed. Build aborted.");
  }

  console.log(`[env-validator] ✅ Environment variables validated (${resolveNetwork()} network).`);
}
