# Local Development Troubleshooting Guide

This guide addresses common issues encountered during setup and local development for StellarWork.

## 1. Contract Build Failures

### Issue: `error: no such subcommand: contract`
**Fix:** You need to install the Soroban CLI.
```bash
cargo install --locked soroban-cli
```

### Issue: `error: failed to run custom build command for 'soroban-env-common ...'`
**Fix:** Ensure you have the `wasm32-unknown-unknown` target installed.
```bash
rustup target add wasm32-unknown-unknown
```

## 2. Frontend Connection Issues

### Issue: `NEXT_PUBLIC_CONTRACT_ID is not configured`
**Fix:** You must create a `.env.local` file in the `frontend` directory and provide the contract ID.
```bash
cd frontend
cp .env.example .env.local
# Edit .env.local to include:
# NEXT_PUBLIC_CONTRACT_ID=CC...
```

### Issue: `Error: contract not found` (in browser)
**Fix:** Ensure the contract is deployed to the network you are connecting to (e.g., Testnet). If you redeployed, make sure to update the ID in `.env.local` and restart the dev server.
```bash
npm run dev
```

## 3. Transaction Failures

### Issue: `HostError: Error(Contract, #10)` (Already Initialized)
**Fix:** The `initialize` function can only be called once. If you need to re-initialize, you must deploy a new instance of the contract.

### Issue: `Insufficient Balance`
**Fix:** Fund your testnet account using Friendbot.
```bash
soroban config identity generate my-identity
# Visit https://laboratory.stellar.org/#account-creator?network=testnet to fund it.
```
Or via CLI:
```bash
soroban config identity fund my-identity --network testnet
```

### Issue: `Unauthorized` / `Error(Contract, #2)`
**Fix:** Ensure the account you are using in the frontend (via Freighter) is the same one expected by the contract method (e.g., the job's client or freelancer).

## 4. Tooling Issues

### Issue: `npm install` hanging or failing
**Fix:** Clear npm cache and retry.
```bash
npm cache clean --force
# On Windows (PowerShell):
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

### Issue: Pre-commit hooks failing
**Fix:** You can run them manually to debug.
```bash
pre-commit run --all-files
```
To bypass hooks (use sparingly):
```bash
git commit -m "..." --no-verify
```
