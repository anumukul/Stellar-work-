#!/usr/bin/env bash
#
# Admin key rotation — SEC-06 (#770).
#
# Walks the two-step ownership transfer with verification built in, and stops
# between nomination and acceptance to make you confirm the pending address.
# That pause is the safety feature, not a formality: it is the last moment at
# which a wrong address costs nothing.
#
# Usage:
#   ./scripts/rotate-admin-key.sh --network testnet \
#       --contract CXXXX... --current alice --new bob
#
# --current and --new are Stellar CLI identity names (`stellar keys ls`), not
# raw secret keys. Nothing here reads or prints a secret key.
#
# Full procedure and backup guidance: docs/admin-key-rotation.md

set -euo pipefail

NETWORK=""
CONTRACT_ID=""
CURRENT_IDENTITY=""
NEW_IDENTITY=""
ASSUME_YES=0

die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!! %s\033[0m\n' "$*"; }

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --network)  NETWORK="${2:-}"; shift 2 ;;
    --contract) CONTRACT_ID="${2:-}"; shift 2 ;;
    --current)  CURRENT_IDENTITY="${2:-}"; shift 2 ;;
    --new)      NEW_IDENTITY="${2:-}"; shift 2 ;;
    --yes)      ASSUME_YES=1; shift ;;
    -h|--help)  usage 0 ;;
    *)          die "unknown argument: $1" ;;
  esac
done

[ -n "$NETWORK" ]          || die "--network is required (testnet or mainnet)"
[ -n "$CONTRACT_ID" ]      || die "--contract is required"
[ -n "$CURRENT_IDENTITY" ] || die "--current is required"
[ -n "$NEW_IDENTITY" ]     || die "--new is required"
command -v stellar >/dev/null 2>&1 || die "the stellar CLI is not on PATH"

invoke() {
  local identity="$1"; shift
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$identity" \
    --network "$NETWORK" \
    -- "$@"
}

# Reads go through the current identity; they change nothing.
read_only() { invoke "$CURRENT_IDENTITY" "$@" 2>/dev/null | tr -d '"'; }

confirm() {
  [ "$ASSUME_YES" -eq 1 ] && return 0
  printf '%s [type YES to continue]: ' "$1"
  read -r reply
  [ "$reply" = "YES" ] || die "aborted"
}

# ── Resolve the addresses behind the identity names ──────────────────────────

step "Resolving identities"
CURRENT_ADDR="$(stellar keys address "$CURRENT_IDENTITY")" \
  || die "could not resolve --current identity '$CURRENT_IDENTITY'"
NEW_ADDR="$(stellar keys address "$NEW_IDENTITY")" \
  || die "could not resolve --new identity '$NEW_IDENTITY'"

printf '  current: %s (%s)\n' "$CURRENT_IDENTITY" "$CURRENT_ADDR"
printf '  new:     %s (%s)\n' "$NEW_IDENTITY" "$NEW_ADDR"

[ "$CURRENT_ADDR" != "$NEW_ADDR" ] || die "the new admin is the current admin; nothing to do"

# ── Preconditions ────────────────────────────────────────────────────────────

step "Checking current state"
ON_CHAIN_ADMIN="$(read_only get_admin)"
printf '  on-chain admin: %s\n' "$ON_CHAIN_ADMIN"

[ "$ON_CHAIN_ADMIN" = "$CURRENT_ADDR" ] \
  || die "--current ($CURRENT_ADDR) is not the on-chain admin ($ON_CHAIN_ADMIN)"

EXISTING_PENDING="$(read_only get_pending_admin || true)"
if [ -n "$EXISTING_PENDING" ] && [ "$EXISTING_PENDING" != "null" ] && [ "$EXISTING_PENDING" != "None" ]; then
  warn "a nomination is already pending: $EXISTING_PENDING"
  warn "continuing will replace it; the existing nominee will no longer be able to accept"
  confirm "Replace the pending nomination?"
fi

if [ "$NETWORK" = "mainnet" ] || [ "$NETWORK" = "public" ]; then
  warn "This is MAINNET. An address whose key is not held loses admin control permanently."
  confirm "Rotate the mainnet admin key?"
fi

# ── Step 1: nominate ─────────────────────────────────────────────────────────

step "Step 1/3 — nominating $NEW_ADDR"
invoke "$CURRENT_IDENTITY" transfer_ownership \
  --admin "$CURRENT_ADDR" --new_admin "$NEW_ADDR"

# ── Step 2: verify before anyone accepts ─────────────────────────────────────

step "Step 2/3 — verifying the nomination"
PENDING="$(read_only get_pending_admin)"
printf '  pending admin: %s\n' "$PENDING"

if [ "$PENDING" != "$NEW_ADDR" ]; then
  warn "the pending admin does not match the intended address!"
  warn "  intended: $NEW_ADDR"
  warn "  on-chain: $PENDING"
  warn "Cancel with: stellar contract invoke --id $CONTRACT_ID --source-account $CURRENT_IDENTITY \\"
  warn "               --network $NETWORK -- cancel_ownership_transfer --admin $CURRENT_ADDR"
  die "nomination mismatch — nothing has been transferred, control is still yours"
fi

# Control has not moved yet. This is the last free exit.
confirm "Nomination verified. Accept as '$NEW_IDENTITY' and hand over control?"

# ── Step 3: accept, signed by the new key ────────────────────────────────────

step "Step 3/3 — accepting as $NEW_IDENTITY"
# Signed by the new identity: this is what proves the key exists and works
# before it is given control.
invoke "$NEW_IDENTITY" accept_ownership --new_admin "$NEW_ADDR"

# ── Verification ─────────────────────────────────────────────────────────────

step "Verifying the rotation"
FINAL_ADMIN="$(stellar contract invoke --id "$CONTRACT_ID" --source-account "$NEW_IDENTITY" \
  --network "$NETWORK" -- get_admin 2>/dev/null | tr -d '"')"
FINAL_PENDING="$(stellar contract invoke --id "$CONTRACT_ID" --source-account "$NEW_IDENTITY" \
  --network "$NETWORK" -- get_pending_admin 2>/dev/null | tr -d '"' || true)"

printf '  admin:         %s\n' "$FINAL_ADMIN"
printf '  pending admin: %s\n' "${FINAL_PENDING:-None}"

[ "$FINAL_ADMIN" = "$NEW_ADDR" ] || die "rotation did not complete — admin is still $FINAL_ADMIN"

case "${FINAL_PENDING:-None}" in
  ""|None|null) ;;
  *) die "a nomination is still pending after acceptance: $FINAL_PENDING" ;;
esac

step "Rotation complete"
cat <<SUMMARY

  contract:    $CONTRACT_ID
  network:     $NETWORK
  old admin:   $CURRENT_ADDR
  new admin:   $NEW_ADDR

Remaining steps — these are not automated on purpose:

  1. Confirm the new admin can act (e.g. re-set the fee to its current value).
  2. Confirm the old admin can no longer act.
  3. Remove the old key from signing infrastructure and CI secrets.
  4. Retain the old key backup until this rotation is confirmed stable.
  5. Record the rotation: date, reason, both addresses, tx hashes.

See docs/admin-key-rotation.md.
SUMMARY
