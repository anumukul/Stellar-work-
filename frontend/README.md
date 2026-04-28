# StellarWork — Frontend

Next.js frontend for the StellarWork decentralized freelance marketplace. Connects to a Soroban escrow contract on Stellar to manage the full job lifecycle without platform custody.

## Tech Stack

| Layer | Library / Version |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 |
| Styling | Tailwind CSS 4 |
| Stellar SDK | `@stellar/stellar-sdk` 15 |
| Wallet | `@stellar/freighter-api` 6 |
| Language | TypeScript 5 |

## Folder Structure

```
frontend/
├── app/                  # Next.js App Router pages
│   ├── page.tsx          # Home / job listing
│   ├── post-job/         # Post a new job
│   ├── job/[id]/         # Job detail & lifecycle actions
│   ├── dashboard/        # Freelancer / client dashboard
│   ├── profile/[address] # Public profile by Stellar address
│   ├── disputes/         # Dispute overview
│   └── admin/            # Admin panel (fee management)
├── lib/
│   ├── contract.ts       # Soroban contract call helpers
│   ├── stellar.ts        # Stellar / Freighter wallet utilities
│   └── types.ts          # Shared TypeScript types
└── public/               # Static assets
```

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — see Environment Variables below

# 3. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_CONTRACT_ID` | ✅ | Deployed escrow contract ID on Stellar |
| `NEXT_PUBLIC_NETWORK` | ✅ | `testnet` or `mainnet` |
| `NEXT_PUBLIC_HORIZON_URL` | ✅ | Horizon RPC endpoint |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | ✅ | Soroban RPC endpoint |

Copy `.env.example` to `.env.local` and fill in the values. The contract ID is printed after running `soroban contract deploy` — see the root [README](../README.md) for the full deploy flow.

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests (vitest) |
| `npm run test:e2e` | Run E2E tests (Playwright, headless) |
| `npm run test:e2e -- --headed` | Run E2E tests with browser visible |
