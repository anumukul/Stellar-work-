#!/usr/bin/env bash
set -euo pipefail

CONTRACT_ID="${1:-}"
NETWORK="${2:-testnet}"
WASM_FILE="${3:-}"

if [[ -z "$CONTRACT_ID" ]]; then
  echo "Usage: $0 <contract-id> [network] [wasm-file]"
  echo ""
  echo "Arguments:"
  echo "  contract-id  The deployed contract ID on Stellar"
  echo "  network      Network name: testnet, mainnet (default: testnet)"
  echo "  wasm-file    Path to locally built WASM file (optional, auto-detected)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONTRACT_DIR="$PROJECT_DIR/contracts/escrow"

if [[ -z "$WASM_FILE" ]]; then
  WASM_FILE="$CONTRACT_DIR/target/wasm32-unknown-unknown/release/escrow.wasm"
fi

if [[ ! -f "$WASM_FILE" ]]; then
  echo "Building contract WASM..."
  cd "$CONTRACT_DIR"
  soroban contract build
fi

if [[ ! -f "$WASM_FILE" ]]; then
  echo "Error: WASM file not found at $WASM_FILE"
  exit 1
fi

LOCAL_HASH=$(sha256sum "$WASM_FILE" | cut -d' ' -f1)
echo "Local WASM hash: $LOCAL_HASH"

case "$NETWORK" in
  testnet)
    RPC_URL="https://soroban-testnet.stellar.org"
    NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
    EXPLORER_URL="https://testnet.stellarexpert.io"
    ;;
  mainnet)
    RPC_URL="https://mainnet.sorobanrpc.com"
    NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
    EXPLORER_URL="https://stellarexpert.io"
    ;;
  *)
    echo "Error: Unknown network '$NETWORK'. Use testnet or mainnet."
    exit 1
    ;;
esac

echo "Fetching deployed contract hash from $NETWORK..."
DEPLOYED_HASH=$(soroban contract fetch \
  --id "$CONTRACT_ID" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  --output-file /dev/stdout 2>/dev/null | sha256sum | cut -d' ' -f1 || echo "")

if [[ -z "$DEPLOYED_HASH" ]]; then
  echo "Warning: Could not fetch deployed contract hash. Skipping hash comparison."
else
  echo "Deployed contract hash: $DEPLOYED_HASH"
  if [[ "$LOCAL_HASH" == "$DEPLOYED_HASH" ]]; then
    echo "Hashes match. Contract source is verified."
  else
    echo "Error: Hash mismatch. Local build does not match deployed contract."
    echo "  Local:    $LOCAL_HASH"
    echo "  Deployed: $DEPLOYED_HASH"
    exit 1
  fi
fi

echo ""
echo "Submitting verification to StellarExpert..."
VERIFY_PAYLOAD=$(cat <<EOF
{
  "contract_id": "$CONTRACT_ID",
  "network": "$NETWORK",
  "wasm_hash": "$LOCAL_HASH",
  "source_repository": "https://github.com/0xratnendra/Stellar-work-",
  "build_command": "soroban contract build",
  "rust_toolchain": "stable",
  "soroban_sdk_version": "21.7.7"
}
EOF
)

echo "$VERIFY_PAYLOAD"

VERIFY_ENDPOINT="${EXPLORER_URL}/api/contract/${CONTRACT_ID}/verify"
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$VERIFY_PAYLOAD" \
  "$VERIFY_ENDPOINT" 2>/dev/null || echo -e "\n000")

HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" || "$HTTP_CODE" == "202" ]]; then
  echo "Verification submitted successfully."
  echo "View on StellarExpert: ${EXPLORER_URL}/contract/${CONTRACT_ID}"
elif [[ "$HTTP_CODE" == "000" ]]; then
  echo "Warning: Could not reach StellarExpert API. Contract may still be verified manually."
  echo "Manual verification: ${EXPLORER_URL}/contract/${CONTRACT_ID}"
else
  echo "Warning: StellarExpert API returned HTTP $HTTP_CODE."
  echo "Response: $HTTP_BODY"
  echo "Manual verification may be required: ${EXPLORER_URL}/contract/${CONTRACT_ID}"
fi

echo ""
echo "Verification complete."
echo "  Contract ID: $CONTRACT_ID"
echo "  Network:     $NETWORK"
echo "  WASM Hash:   $LOCAL_HASH"
