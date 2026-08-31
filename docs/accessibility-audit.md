# Accessibility Audit: Touch Targets, Names, Focus Order

Covers A11Y-29 ([#767](https://github.com/anumukul/Stellar-work-/issues/767)),
A11Y-30 ([#768](https://github.com/anumukul/Stellar-work-/issues/768)) and
A11Y-31 ([#769](https://github.com/anumukul/Stellar-work-/issues/769)).

Three audits, their findings, the exceptions, and the automated checks that stop
each one regressing.

---

## How this is checked

| Layer | What it catches | Where |
| --- | --- | --- |
| **ESLint (jsx-a11y)** | Static defects — missing labels, bad roles, positive tabIndex | `frontend/eslint.config.mjs` |
| **Playwright** | Layout-dependent defects — target size, focus order, focus visibility | `frontend/e2e/a11y-audit.spec.ts` |
| **Manual** | Everything a machine cannot judge | [Reviewer checklist](#reviewer-checklist) |

Touch-target size and focus order are properties of **layout**, and jsdom has no
layout engine. A unit test can assert a class name is present; it cannot assert
the element is 44px tall or that Tab moves down the page rather than across it.
That is why those checks run in a real browser.

```bash
cd frontend
npm run lint                                  # static
npx playwright test e2e/a11y-audit.spec.ts    # layout + keyboard
```

---

## Lint rules and the backlog

`eslint-config-next` enables six `jsx-a11y` rules. This adds fifteen more.

**Severity reflects triage, not importance.** A rule with no current violations
is `error` — it can never regress silently. A rule with an existing backlog is
`warn`, so the count stays visible without burying 57 new errors in a lint run
that is already red for unrelated reasons.

### Locked at `error` — clean today

`anchor-has-content`, `anchor-is-valid`, `aria-role`, `img-redundant-alt`,
`iframe-has-title`, `heading-has-content`, `scope`, `tabindex-no-positive`,
`interactive-supports-focus`

### Backlog — currently `warn`

| Rule | Count | Escalate to `error` when |
| --- | ---: | --- |
| `label-has-associated-control` | 33 | every form control has an associated `<label>` |
| `control-has-associated-label` | 11 | every icon-only control has a name |
| `no-noninteractive-element-interactions` | 6 | handlers move to interactive elements |
| `click-events-have-key-events` | 3 | click handlers have keyboard equivalents |
| `no-redundant-roles` | 1 | see [exceptions](#documented-exceptions) |
| `no-noninteractive-tabindex` | 1 | see [exceptions](#documented-exceptions) |

The 33 label findings are the largest single gap and the highest-value one:
a form field with no associated label is announced as just "edit text", so a
screen-reader user filling in the post-job form is guessing at every field.

---

## A11Y-29 — touch targets (#767)

**Bar: 44×44 CSS px.** WCAG 2.5.5 (AAA) specifies 44; WCAG 2.5.8 (AA) relaxes to
24 with spacing. 44 is what both iOS and Android recommend, and it is what the
automated check enforces.

Measured at **390px viewport** — this is a pointer-accuracy problem, and the
desktop layout is not where it bites.

### Enlarging without changing the visual design

The issue asks to keep visual size stable. Two ways, in order of preference:

```css
/* 1. Padding — grows the box, keeps the ink the same size. */
.icon-button { padding: 0.75rem; }        /* a 20px icon becomes a 44px target */

/* 2. A pseudo-element — when padding would break the layout. */
.compact-control { position: relative; }
.compact-control::after {
  content: "";
  position: absolute;
  inset: -8px;          /* extends the hit area past the visible bounds */
}
```

Prefer padding. The pseudo-element trick expands an invisible region that can
overlap a neighbouring control, so two adjacent chips can end up stealing each
other's taps — check spacing when using it.

### Exempt

- **Links inside a sentence.** WCAG 2.5.8 excludes targets in a block of text;
  enlarging them breaks the line height. The check skips an `<a>` whose text is
  shorter than its containing paragraph.
- **Zero-size elements.** A collapsed menu item or an unfocused skip link is not
  rendered, so it is not a tap target.

---

## A11Y-30 — alt text and accessible names (#768)

### Images

Both `<img>` elements in the codebase (`components/ImageGallery.tsx`,
`components/Lightbox.tsx`) carry `alt`, sourced from the image record rather
than hard-coded. No defects.

The rule the automated check enforces: **a missing `alt` attribute is a defect;
an empty `alt=""` is not.** A missing attribute makes a screen reader announce
the filename; an empty one correctly marks the image decorative. They are
opposite intentions and must not be conflated.

### Icon-only controls

`aria-label` appears across 53 component files. The Playwright check verifies
every rendered `button`, `a[href]` and `[role="button"]` resolves to a non-empty
accessible name via `aria-label`, `aria-labelledby`, `title` or text content.

An icon-only button with no name is announced as just "button" — the user is
told a control exists but not what it does.

### SVGs

An inline SVG needs **either** a name (it conveys something) **or**
`aria-hidden="true"` (it does not). Neither leaves a screen reader to guess, and
most announce a bare "graphic". The check exempts an SVG inside an already
labelled control, where the parent supplies the name.

---

## A11Y-31 — tab order (#769)

### Expected order

Documented so a new component has something to conform to.

**All routes** — skip link → header nav (left to right) → wallet menu → main
content → footer.

| Route | Within main |
| --- | --- |
| `/` | search → filter chips (left to right) → job cards (visual order) → pagination |
| `/post-job` | form fields in visual order → submit |
| `/job/[id]` | back link → primary action → secondary actions → related links |
| `/dashboard` | tabs → filters → job rows in visual order |

**Rules for new components**

1. **Never use a positive `tabIndex`.** It jumps the element ahead of the whole
   document and is the most common cause of unexpected focus order. Enforced at
   `error`.
2. `tabIndex={0}` puts an element in the natural order; `tabIndex={-1}` makes it
   focusable only programmatically. A container that handles keys — a menu, a
   grid — needs `-1` so it can receive focus without adding a tab stop.
3. **Tab order follows the DOM, not CSS.** `order`, `row-reverse` and
   `grid-area` change the visual order without changing the DOM, so focus and
   the eye diverge. If they must differ, reorder the DOM.
4. **Dialogs**: focus moves in on open, is trapped while open, and **returns to
   the trigger** on close. A user who opens a dialog from the middle of a page
   must not be returned to the top.

### Fixed in this change

| Component | Defect | Fix |
| --- | --- | --- |
| `components/WalletMenu.tsx` | `role="menu"` with an `onKeyDown` handler but no `tabIndex` — it could never receive focus, so arrow-key navigation only worked if focus was already inside | `tabIndex={-1}` |
| `components/DashboardWidgets.tsx` | `role="gridcell"` not focusable — a keyboard user could not reach a widget at all, including to reorder it | `tabIndex={0}` |

---

## Documented exceptions

Recorded so nobody re-investigates them.

| Location | Rule | Why it stands |
| --- | --- | --- |
| `app/dashboard/page.tsx` | `aria-role` | `role="client"` / `role="freelancer"` are **props on the `JobSection` component**, not ARIA roles on a DOM element. `jsx-a11y` cannot distinguish a custom component prop from a DOM attribute. Suppressed at file level with a reason |
| `components/CallHistory.tsx:40` | `no-redundant-roles` | `<ul role="list">` is redundant per spec, but Safari removes list semantics when `list-style: none` is applied. The explicit role restores them. Deliberate WebKit workaround |
| `components/Tooltip.tsx:133` | `no-noninteractive-tabindex` | `tabIndex` on a `<span>` is opt-in (`focusable ? 0 : undefined`) and exists so keyboard users can trigger a tooltip on a non-interactive target. Intentional |

---

## Reviewer checklist

For any PR touching the interface.

**Touch targets**

- [ ] New buttons, chips and icon controls are at least 44×44 at 390px
- [ ] Hit area was expanded with padding rather than by scaling the icon
- [ ] Adjacent expanded targets do not overlap

**Names**

- [ ] Every `<img>` has `alt` — empty only if genuinely decorative
- [ ] Every icon-only control has an `aria-label`
- [ ] Every inline SVG is either named or `aria-hidden="true"`

**Focus**

- [ ] No positive `tabIndex`
- [ ] Tab order matches visual order
- [ ] Every focused element shows a visible indicator
- [ ] A dialog returns focus to its trigger on close
- [ ] Nothing is reachable only with a mouse

---

## What is still not covered

Honest gaps, so nobody reads this as a clean bill of health:

- **No screen-reader pass.** Never tested with NVDA, JAWS or VoiceOver. The
  automated name checks confirm a name *exists*, not that it makes sense when
  read aloud.
- **Colour contrast unmeasured.** Out of scope for these three issues, and still
  the largest unknown.
- **Focus-visibility check is a heuristic.** It looks for an outline, box-shadow
  or border change; a design that indicates focus another way would be a false
  positive, and a low-contrast indicator passes it.
- **The 33 label findings are unfixed.** Counted and tracked, not resolved.
