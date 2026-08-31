# Responsive Breakpoint Testing Checklist

This checklist is the manual companion to the automated horizontal-overflow / clipping checks run in CI (`frontend/e2e/overflow-clip.spec.ts`). Use it for a final human pass before a release; the automated spec covers document-level overflow and capture of full-page screenshots at each breakpoint.

## Breakpoints

The app is built on Tailwind's default breakpoints:

| Name | Width | Typical device |
|------|-------|----------------|
| Default | < 640px | Small phones (375px iPhone SE / 393px Pixel 5) |
| `sm` | ≥ 640px | Large phones (landscape), small tablets |
| `md` | ≥ 768px | Tablets portrait (768x1024 iPad) |
| `lg` | ≥ 1024px | Tablets landscape, small laptops |
| `xl` | ≥ 1280px | Laptops and desktops |

Primary navigation collapses to the hamburger menu below `md` (768px).

## Automated Check

CI runs `npx playwright test` (see `frontend.yml`), which includes every route below at `375x812`, `768x1024`, and `1280x800`:

1. Loads the route at the breakpoint.
2. Asserts there is **no horizontal document overflow** (`document.scrollWidth <= clientWidth`).
3. Reports the offending element when overflow exists (element selector + left/right edge).
4. Captures a **full-page screenshot** uploaded as the `e2e-screenshots` CI artifact.

Local run:

```bash
cd frontend
npx playwright test e2e/overflow-clip.spec.ts
```

## Manual Checklist

Run each row against every breakpoint. Anything marked below-`md` applies to `375` and `768`; everything else applies to `375`, `768`, `1024`, and `1280`.

### Global / chrome

- [ ] Navigation collapses to hamburger below `md`; menu opens, closes, and focus-traps correctly.
- [ ] No horizontal scrollbar at any point on any page.
- [ ] Footer columns stack on mobile and sit side-by-side on desktop.
- [ ] Modals and dialogs fit the viewport ("max-height" scroll instead of page scroll) on touch devices.
- [ ] Left-aligned page gutter (`lg:ml-[220px]`) does not cause overflow at `lg`/`xl`.

### Home (job list) — `/`

- [ ] Job cards are single-column below `md`, multi-column at `md` and up.
- [ ] Grid/List toggle both layout modes at every breakpoint.
- [ ] Action buttons ("View Details", "Accept Job", "Save") wrap instead of overflowing on `375`.
- [ ] Long deadline text wraps; `Deadline:` line does not push the card wide.
- [ ] Favorites filter and search bar remain usable below `md`.

### Job detail — `/job/[id]`

- [ ] Sticky mobile footer (actions bar) sits above OS browser chrome and does not overlap content (`job-detail-mobile-footer` tests cover this too).
- [ ] Between `md` and `lg` the sidebar (client/freelancer info) stacks cleanly.
- [ ] Long descriptions render with overflow hidden/clamp, no horizontal scroll.
- [ ] Transactions/version history tables scroll horizontally inside their container below `md`, not the page.

### Post job — `/post-job`

- [ ] The rich-text editor toolbar wraps on `375`; the editor iframe/content area stays within the viewport.
- [ ] Amount/token inputs and the sticky submit summary stack on mobile.

### Dashboard & analytics — `/dashboard`, `/analytics*`

- [ ] Filter chips wrap into multiple rows; no chip is clipped.
- [ ] Charts scale to container width (`recharts` ResponsiveContainer); no fixed-width overflow.
- [ ] Bookmarked-jobs list stacks below `md`.

### Disputes — `/disputes`

- [ ] Tabs (`All` / `Pending` / etc.) are horizontally scrollable inside their container below `md`, not the page.
- [ ] Dispute rows render as cards below `md`, table above.

### Profile — `/profile`, `/profile/[address]`

- [ ] Two-column desktop layout stacks at `md`.
- [ ] Skills/experience/education sections have editable rows usable on touch.

### Messages & meetings — `/messages`, `/meetings`

- [ ] Message input and send button never overflow the viewport width.
- [ ] Typing indicator, unread badges, and meeting cards stack on mobile.

### Secondary routes — `/transactions`, `/compare`, `/earnings-estimator`, `/fee-calculator`, `/legal/*`, `/help`, `/settings`, `/admin`

- [ ] Tables scroll inside containers below `md`.
- [ ] Currency/TVL stat cards wrap into a single column on `375`.

## Recording results

- [ ] Screenshots from the CI artifact `e2e-screenshots/` reviewed at each breakpoint per changed route.
- [ ] Any overflow introduced by a new component is fixed before merge (CI fails otherwise).

## Related docs

- [TESTING_MATRIX.md](./TESTING_MATRIX.md) — full manual cross-browser matrix and BrowserStack setup
- [testing-matrix.md](./testing-matrix.md) — unit/integration/e2e command reference
- [ARCHITECTURE.md](./ARCHITECTURE.md) — component/layout overview