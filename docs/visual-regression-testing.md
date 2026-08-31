# Visual Regression Testing

TEST-11 ([#762](https://github.com/anumukul/Stellar-work-/issues/762)).

Unit tests assert that a component renders. They say nothing about whether the
result still *looks* right. A changed utility class, a bumped dependency or a
renamed design token can move a layout without failing a single assertion.
These screenshots are the safety net for that.

## What is covered

[`frontend/e2e/visual-regression.spec.ts`](../frontend/e2e/visual-regression.spec.ts)
captures five pages at two widths — ten baselines.

| Page | Route |
| --- | --- |
| Home | `/` |
| Job detail | `/job/1` |
| Dashboard | `/dashboard` |
| Post job | `/post-job` |
| Profile | `/profile/{address}` |

| Viewport | Width | Represents |
| --- | ---: | --- |
| `mobile` | 390px | iPhone-class handset |
| `desktop` | 1440px | Laptop |

Baselines are captured on **chromium only**. The other Playwright projects are
skipped: rendering differences between engines would demand three sets of
images for no extra signal, since viewport width is what these tests vary.

## Running

```bash
cd frontend
npm run test:visual              # compare against baselines
npm run test:visual:update       # regenerate all baselines
```

One page only:

```bash
npx playwright test e2e/visual-regression.spec.ts --project=chromium \
  --update-snapshots --grep "home page"
```

First run on a machine with no baselines writes them and passes. **Inspect what
it wrote before committing** — an initial baseline is just as much an assertion
as an updated one.

## Reviewing a diff

A failure produces `-actual`, `-expected` and `-diff` PNGs under
`test-results/`. The HTML report shows them side by side:

```bash
npx playwright show-report
```

Then decide, in this order:

1. **Is the change intended?** If not, it is a regression — fix the code.
2. **Is it confined to what changed?** A padding tweak that also moves the
   footer is two changes, one of them unintended.
3. **Is it deterministic?** If the same page diffs differently on each run, the
   baseline is unstable — fix the instability (see below) rather than
   re-approving.

Only then regenerate and commit the new image, in the same PR as the change
that caused it.

> An updated baseline is a claim that the new rendering is correct. Re-approving
> without looking is how visual testing stops being a safety net and becomes a
> ritual.

## Determinism

A flaky baseline is worse than none, because people learn to re-approve diffs
without reading them. Four sources of drift are removed:

| Source | How it is handled |
| --- | --- |
| **Network** | `page.route` stubs `/api/**`, Soroban RPC and Horizon. Nothing leaves the browser |
| **Wallet** | Freighter mocked via `addInitScript` with a fixed address |
| **Time** | `Date.now` pinned to a fixed instant, so "2 days ago" never becomes "3 days ago" |
| **Motion** | Animations and transitions disabled; fonts awaited before capture |

`Math.random` is seeded too — some list keys and skeleton widths derive from it.

Three tests guard the guards: two captures of the same page must agree, the
clock must be pinned, and **no request may escape to the network**. If those
fail, every other baseline is suspect.

`maxDiffPixelRatio` is `0.01`. Anti-aliasing differs by a pixel or two between
machines and sometimes between runs on the same GPU; zero tolerance makes the
suite unusable, while 1% still fails on any real layout shift.

## When a baseline is unstable

Symptoms: the same page diffs on consecutive runs, or passes locally and fails
in CI.

1. Run the determinism tests: `npx playwright test --grep "determinism"`.
2. If "no request escapes" fails, an unstubbed call is reaching the network —
   add it to `stubNetwork`.
3. If the diff is confined to a region, mask it rather than loosening the
   threshold for the whole page:

   ```ts
   mask: [page.locator("[data-testid='live-timestamp']")],
   ```

   Masking one element keeps the rest of the page strict. Raising the global
   tolerance blinds every assertion on that page.

## CI

Baselines are platform-specific — fonts and rasterisation differ between a
developer's machine and a CI container, so images captured on one will diff on
the other.

Two workable arrangements:

- **Commit CI-generated baselines.** Regenerate in a container matching CI and
  commit those. Local runs may diff; treat CI as authoritative.
- **Run only in CI.** Do not commit baselines from developer machines; let CI
  own them entirely.

Either way, decide once and write it down here. The failure mode of leaving it
implicit is a suite that is permanently red for everyone except whoever last
regenerated it.

## Adding a page

1. Add it to the `PAGES` array in the spec.
2. Make sure any data it needs is stubbed in `stubNetwork`.
3. Run `npm run test:visual:update`.
4. Inspect both new PNGs before committing.

## Related

- [accessibility-conformance.md](accessibility-conformance.md) — visual tests
  catch layout shifts that break reflow (WCAG 1.4.10)
- [TESTING_MATRIX.md](TESTING_MATRIX.md) — where this fits among the other suites
