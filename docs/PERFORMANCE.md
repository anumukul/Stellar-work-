# Performance Optimization Guide

## Smart Contract Performance

### Storage Access Patterns

- **Minimize persistent reads/writes**: Each `e.storage().persistent().get()` costs ~6,250 CPU instructions. Batch reads where possible and cache values in local variables.
- **Use instance storage for shared, frequently-accessed values**: Admin, fee config, and job count are in instance storage (cheaper than persistent for hot paths).
- **TTL management**: Active jobs use 518,400 ledger bumps (~30 days). Completed/cancelled jobs use 120,960 (~7 days). Avoid unnecessary TTL extensions.
- **`bump_instance_ttl` sparingly**: Only call when instance-level state changes, not on every read-only query.

### Data Structure Choices

- **`Vec` vs `Map`**: Use `Vec` for sequential iteration (job lists, fee tiers). Use `Map`-like key patterns (`DataKey::Job(u64)`) for O(1) lookups by ID.
- **Struct layout**: Keep structs minimal — each field adds to calldata and storage costs. Use `Option<T>` only when semantically required.
- **`BytesN<32>` for hashes**: Fixed-size arrays are cheaper than `String` for hash storage. Use `BytesN<32>` over `String` for all hash-like data.

### Batching Strategies

- Use `get_jobs_batch(start, limit)` for paginated reads instead of individual `get_job` calls.
- **PERF-01:** Prefer `get_job_requiring_status` / combined job+status helpers so mutation paths do one persistent read, then reuse the in-memory `Job` (including `status`) instead of re-fetching.
- **PERF-01:** Cache instance values such as fee bps across batch loops (`batch_approve_jobs` reads fee config once per call).
- **PERF-01:** Access checks (`require_active_access`) short-circuit: blacklist first, then whitelist only when whitelist mode is enabled.
- `batch_resolve_disputes` processes up to 20 disputes in a single admin call, reducing per-job overhead.
- For multi-item operations (fee tiers, milestones), prefer single storage entries over per-item keys.

### Gas Cost Benchmarks

See `contracts/CONTRACT.md` for per-function gas estimates. Key takeaways:

| Operation | Relative Cost |
|---|---|
| Storage read (persistent) | ~6,250 CPU instructions |
| Token transfer | Most expensive single op |
| `require_auth` | ~1,500 CPU instructions |
| Storage write (persistent) | ~12,000 CPU instructions |

## Frontend Performance

### Bundle Size Optimization

- **Code splitting**: Next.js automatically code-splits per route. Avoid `import`ing large libraries in shared components.
- **Dynamic imports**: Use `next/dynamic` for heavy components (rich text editor, chart libraries):
  ```tsx
  const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });
  ```
- **Tree shaking**: Import only what you need from libraries (e.g., `import {某 } from "lodash"` instead of `import _ from "lodash"`).

### RPC Call Batching and Caching

- **Batch reads**: Use `get_jobs_batch` instead of iterating `get_job` for lists. A single batch call reads N jobs in one query.
- **Cache contract responses**: Wrap contract calls with React Query or a simple memoization layer to avoid redundant calls within the same render cycle.
- **Debounce search/autocomplete inputs**: Avoid firing a contract call on every keystroke.

### Image Optimization

- Use Next.js `<Image>` component with `width` and `height` for automatic optimization.
- Use WebP format via Next.js built-in image optimization.
- Lazy-load below-the-fold images with `loading="lazy"`.

### Reducing Re-renders

- Use `React.memo` on pure presentational components (status pills, badges, cards) that receive the same props.
- Use `useMemo` and `useCallback` for expensive computations and stable callbacks passed to child components.
- Use `useRef` for values that should not trigger re-renders.

### Virtual Scrolling

For large job lists, implement virtual scrolling using libraries like `@tanstack/react-virtual`:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";
const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => scrollRef.current, estimateSize: () => 80 });
```

## RPC Optimization

### Batch Read Functions

Always prefer batch read functions over individual queries:

- `get_jobs_batch(start, limit)` → batch of jobs
- `admin_get_jobs_by_status` → filtered list in one call
- `get_fee_tiers` → all fee tiers in one call

### Event-Based Updates vs Polling

- Use contract events (`e.events().publish`) for real-time updates where possible.
- Fall back to polling with reasonable intervals (5-30s depending on freshness requirements).
- The messaging system uses localStorage events for cross-tab sync — prefer this pattern over HTTP polling.

### Connection Pooling and Keepalive

- For RPC providers: use a single persistent connection with keepalive.
- In the browser, reuse the Stellar SDK `Server` instance across calls:
  ```tsx
  const server = new SorobanRpc.Server(process.env.NEXT_PUBLIC_RPC_URL);
  ```

## Performance Budgets

### Target Metrics

| Metric | Target |
|---|---|
| Page load (initial) | < 2s |
| Page load (subsequent) | < 500ms |
| Contract call (read) | < 1s |
| Contract call (write) | < 5s |
| Bundle size (initial JS) | < 200 KB |
| Bundle size (total) | < 500 KB |
| Lighthouse Performance score | > 90 |
| First Input Delay (FID) | < 100ms |
| Cumulative Layout Shift (CLS) | < 0.1 |
