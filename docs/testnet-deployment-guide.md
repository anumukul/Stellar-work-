# Stellar Testnet Deployment Guide

This guide explains how to build, deploy, initialize, and verify the `contracts/escrow` contract on Stellar Testnet.

## Prerequisites

- Soroban CLI installed.
- A funded Stellar Testnet account.
- Project cloned locally.

## 1) Configure Soroban Identity and Network

```bash
soroban config identity generate stellarwork-admin
soroban config identity address stellarwork-admin
```

```bash
soroban config network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

## 2) Build Contract

```bash
cd contracts/escrow
cargo test
soroban contract build
```

WASM path:

```bash
target/wasm32-unknown-unknown/release/escrow.wasm
```

## 3) Deploy Contract

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow.wasm \
  --source stellarwork-admin \
  --network testnet
```

Copy the returned contract ID.

## 4) Initialize Contract

Invoke `initialize(admin, native_token)` once:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source stellarwork-admin \
  --network testnet \
  -- initialize \
  --admin <ADMIN_ADDRESS> \
  --native_token <NATIVE_TOKEN_CONTRACT_ADDRESS>
```

## 5) Configure Frontend

```bash
cd frontend
cp .env.example .env.local
```

Set:

```bash
NEXT_PUBLIC_CONTRACT_ID=<CONTRACT_ID>
```

Start app:

```bash
npm install
npm run dev
```

## 6) Smoke Check

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_job_count
```

## Common Errors

- `NEXT_PUBLIC_CONTRACT_ID is not configured.`  
  Ensure `frontend/.env.local` has `NEXT_PUBLIC_CONTRACT_ID` and restart dev server.
- `contract not found`  
  Wrong contract ID or wrong network.
- `HostError: Error(Contract, #...)`  
  Business-rule failure (wrong status, unauthorized caller, etc.).
