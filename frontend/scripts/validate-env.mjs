#!/usr/bin/env node
// Build-time environment variable validation (#645).
//
// Mirrors the required/optional checks in lib/config.ts's validateConfig(),
// but runs as a plain Node script so it can fail the build *before* `next
// build` starts — catching a missing NEXT_PUBLIC_CONTRACT_ID at deploy time
// instead of as a runtime error a user hits in the browser.
//
// Wired as the "prebuild" script in package.json, so `npm run build` runs
// this automatically. Can also be run standalone: `npm run validate-env`.

const errors = [];
const warnings = [];

const contractId =
  process.env.NEXT_PUBLIC_CONTRACT_ID_TESTNET ??
  process.env.NEXT_PUBLIC_CONTRACT_ID_FUTURENET ??
  process.env.NEXT_PUBLIC_CONTRACT_ID_MAINNET ??
  process.env.NEXT_PUBLIC_CONTRACT_ID ??
  "";

if (!contractId) {
  errors.push(
    "NEXT_PUBLIC_CONTRACT_ID is required (or one of the per-network " +
      "variants: NEXT_PUBLIC_CONTRACT_ID_TESTNET / _FUTURENET / _MAINNET). " +
      "Set it to the deployed escrow contract ID.",
  );
} else if (!/^C[A-Z2-7]{55}$/.test(contractId)) {
  // Soroban contract IDs are StrKey-encoded: 'C' prefix + 55 base32 chars.
  errors.push(
    `NEXT_PUBLIC_CONTRACT_ID ("${contractId}") does not look like a valid ` +
      "Soroban contract ID (expected 'C' followed by 55 base32 characters).",
  );
}

const networkRaw = process.env.NEXT_PUBLIC_NETWORK ?? "";
if (networkRaw && !["mainnet", "testnet", "futurenet"].includes(networkRaw)) {
  warnings.push(
    `NEXT_PUBLIC_NETWORK has unrecognized value "${networkRaw}" ` +
      '(expected "mainnet", "testnet", or "futurenet"); the app will default to "testnet".',
  );
}

const sorobanRpc = process.env.NEXT_PUBLIC_SOROBAN_RPC ?? "";
if (networkRaw === "mainnet" && sorobanRpc.includes("testnet")) {
  errors.push(
    "NEXT_PUBLIC_NETWORK is \"mainnet\" but NEXT_PUBLIC_SOROBAN_RPC points " +
      "to a testnet endpoint. Refusing to build a mainnet deployment " +
      "wired to testnet RPC.",
  );
}

if (!process.env.NEXT_PUBLIC_NATIVE_TOKEN) {
  warnings.push(
    "NEXT_PUBLIC_NATIVE_TOKEN is not set. The post-job form will require manual token address entry.",
  );
}
if (!process.env.NEXT_PUBLIC_ADMIN_ADDRESS) {
  warnings.push(
    "NEXT_PUBLIC_ADMIN_ADDRESS is not set. Admin panel will be disabled for safety.",
  );
}

for (const warning of warnings) {
  console.warn(`::warning title=Env validation::${warning}`);
}

if (errors.length > 0) {
  console.error("\nEnvironment validation failed:\n");
  for (const error of errors) {
    console.error(`  ✗ ${error}`);
  }
  console.error(
    "\nSee frontend/.env.example for the full list of variables, or docs/environments.md.\n",
  );
  process.exit(1);
}

console.log(`Env validation passed (${warnings.length} warning(s)).`);
