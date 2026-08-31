# Accessibility Conformance Report

DOC-42 ([#760](https://github.com/anumukul/Stellar-work-/issues/760)).

A record of what accessibility work exists in the StellarWork interface, what
does not, and how to check either. Without it, every future audit starts from
zero and every new contributor has to rediscover the same ground.

**Target:** WCAG 2.1 Level AA.
**Status:** partial conformance — see [known gaps](#known-gaps).

> This is a **self-assessment by the maintainers**, not a third-party audit and
> not a VPAT. It records what has been implemented and observed, and is honest
> about what has not been verified. Where a criterion has not been tested, it
> says so rather than claiming a pass.

---

## How to read the status column

| Status | Meaning |
| --- | --- |
| ✅ Implemented | Present and manually verified |
| 🟡 Partial | Present in some places, missing or unverified in others |
| ❌ Gap | Known to be missing |
| ⚪ Not assessed | No one has checked; do not assume either way |
| — | Not applicable to this interface |

⚪ is used deliberately and often. An untested criterion marked "pass" is worse
than one marked unknown, because it stops anyone looking.

---

## Implemented features

Concrete accessibility work already in the codebase:

| Feature | Where | Notes |
| --- | --- | --- |
| Skip link | `app/layout.tsx` | "Skip to main content", visible on focus |
| Document language | `app/layout.tsx` | `lang={locale}`, follows the active locale |
| Live regions | `components/AriaLiveRegion.tsx` and 14 other files | Announces async state changes |
| Modal semantics | `components/ConfirmDialog.tsx` | `role="dialog"`, `aria-modal="true"`, Escape to cancel |
| Reduced motion | `app/globals.css` | `@media (prefers-reduced-motion: reduce)` block |
| Focus styling | ~20 component files | `focus:` / `focus-visible:` utilities |
| ARIA labelling | 53 component files | `aria-label` on icon-only controls |
| Landmark roles | 44 component files | `role=` on navigation, main and status regions |
| Loading announcements | `components/LoadingState.tsx`, `JobDetailPageSkeleton.tsx` | `sr-only` text alongside skeletons |
| Offline status | `components/OfflineIndicator.tsx` | Announced, not colour-only |
| Localisation | `messages/en.json`, `messages/es.json` | Two locales |
| Mobile navigation | `app/navigation.tsx` | `aria-expanded` on the toggle, covered by e2e tests |

---

## WCAG 2.1 AA by criterion

### 1. Perceivable

| Criterion | Level | Status | Notes |
| --- | --- | --- | --- |
| 1.1.1 Non-text Content | A | 🟡 | `aria-label` widely used on icon buttons; decorative images not systematically audited |
| 1.2.x Time-based Media | A/AA | — | No audio or video in the interface |
| 1.3.1 Info and Relationships | A | 🟡 | Landmarks and headings present; form label association not fully verified |
| 1.3.2 Meaningful Sequence | A | ⚪ | Not assessed |
| 1.3.3 Sensory Characteristics | A | ✅ | No instruction relies on shape or position alone |
| 1.3.4 Orientation | AA | ✅ | Responsive; no orientation lock |
| 1.3.5 Identify Input Purpose | AA | ⚪ | `autocomplete` attributes not audited |
| 1.4.1 Use of Color | A | 🟡 | Job status uses badges with text, not colour alone; some charts unverified |
| 1.4.3 Contrast (Minimum) | AA | ⚪ | **Not measured.** Light and dark themes both need checking |
| 1.4.4 Resize Text | AA | ⚪ | Not assessed at 200% |
| 1.4.5 Images of Text | AA | ✅ | No text baked into images |
| 1.4.10 Reflow | AA | ✅ | Verified at 390px by responsive and overflow-clip e2e tests |
| 1.4.11 Non-text Contrast | AA | ⚪ | Not measured |
| 1.4.12 Text Spacing | AA | ⚪ | Not assessed |
| 1.4.13 Content on Hover or Focus | AA | ⚪ | Tooltip dismissal not audited |

### 2. Operable

| Criterion | Level | Status | Notes |
| --- | --- | --- | --- |
| 2.1.1 Keyboard | A | 🟡 | Dialogs and navigation are keyboard-operable; not every flow walked end to end |
| 2.1.2 No Keyboard Trap | A | 🟡 | `ConfirmDialog` releases focus on Escape; other overlays unverified |
| 2.1.4 Character Key Shortcuts | A | ⚪ | Command palette shortcuts not audited for this |
| 2.2.1 Timing Adjustable | A | 🟡 | `CancellationCountdown` is informational, not a deadline the user must beat |
| 2.2.2 Pause, Stop, Hide | A | ✅ | Reduced-motion honoured; no auto-playing content |
| 2.3.1 Three Flashes | A | ✅ | No flashing content |
| 2.4.1 Bypass Blocks | A | ✅ | Skip link in `app/layout.tsx` |
| 2.4.2 Page Titled | A | ✅ | Per-route titles; asserted by `e2e/home.spec.ts` |
| 2.4.3 Focus Order | A | ⚪ | Not systematically assessed |
| 2.4.4 Link Purpose | A | 🟡 | Most links self-describing; some "View" / "Details" links lack context |
| 2.4.5 Multiple Ways | AA | ✅ | Navigation, search and command palette |
| 2.4.6 Headings and Labels | AA | 🟡 | Docs audited ([heading-hierarchy-audit.md](heading-hierarchy-audit.md)); app pages not |
| 2.4.7 Focus Visible | AA | 🟡 | Focus styles in ~20 files; no global guarantee |
| 2.5.1 Pointer Gestures | A | 🟡 | Swipe actions exist (`lib/swipe-actions.ts`); single-pointer alternatives unverified |
| 2.5.2 Pointer Cancellation | A | ⚪ | Not assessed |
| 2.5.3 Label in Name | A | ⚪ | Not assessed |
| 2.5.4 Motion Actuation | A | — | No motion-actuated functionality |

### 3. Understandable

| Criterion | Level | Status | Notes |
| --- | --- | --- | --- |
| 3.1.1 Language of Page | A | ✅ | `lang` follows the active locale |
| 3.1.2 Language of Parts | AA | ⚪ | Mixed-language content not marked |
| 3.2.1 On Focus | A | ✅ | No context change on focus |
| 3.2.2 On Input | A | ⚪ | Not assessed |
| 3.2.3 Consistent Navigation | AA | ✅ | Shared layout across routes |
| 3.2.4 Consistent Identification | AA | ✅ | Shared component library |
| 3.3.1 Error Identification | A | ✅ | `components/ErrorBanner.tsx`; messages catalogued in [contract-error-messages.md](contract-error-messages.md) |
| 3.3.2 Labels or Instructions | A | 🟡 | Forms labelled; not every field audited |
| 3.3.3 Error Suggestion | AA | ✅ | Every contract error pairs a message with a suggested action |
| 3.3.4 Error Prevention | AA | ✅ | `ConfirmDialog` guards destructive and irreversible actions |

### 4. Robust

| Criterion | Level | Status | Notes |
| --- | --- | --- | --- |
| 4.1.1 Parsing | A | — | Obsolete in WCAG 2.2; React output is well-formed |
| 4.1.2 Name, Role, Value | A | 🟡 | ARIA used widely; custom controls not individually verified |
| 4.1.3 Status Messages | AA | ✅ | `AriaLiveRegion` plus live regions in 15 files |

---

## Known gaps

Ordered by how much they affect users, not by how hard they are to fix.

| Gap | Criteria | Impact |
| --- | --- | --- |
| **Colour contrast never measured** | 1.4.3, 1.4.11 | Unknown-but-plausible failures in both themes. The largest single unknown here |
| **No automated a11y testing** | many | Nothing prevents a regression; every check is manual and therefore intermittent |
| **No screen reader pass** | 1.3.1, 4.1.2 | Never tested with NVDA, JAWS or VoiceOver |
| **Focus order unverified** | 2.4.3 | Tab order may not follow visual order on complex pages |
| **Focus trap only in `ConfirmDialog`** | 2.1.2 | Other overlays may trap or leak focus |
| **Swipe actions may lack alternatives** | 2.5.1 | Mobile actions could be unreachable without gestures |
| **Form labels not fully audited** | 1.3.1, 3.3.2 | Some inputs may rely on placeholder text as a label |
| **No 200% zoom check** | 1.4.4 | Layout may break for low-vision users |

None of these has an open issue yet. **Opening them is the natural next step
after this report** — link them here as they are filed, so the report stays a
live index rather than a snapshot.

---

## Reviewer checklist

A lightweight pass for any PR touching the interface. Not a substitute for a
full audit; it catches the regressions that are cheap to catch.

**Keyboard**

- [ ] Every interactive element is reachable by Tab
- [ ] Focus is visible at every stop
- [ ] Tab order follows visual order
- [ ] Escape closes any dialog or overlay opened
- [ ] Focus returns to the trigger after a dialog closes
- [ ] Nothing is reachable only by mouse or gesture

**Semantics**

- [ ] Icon-only buttons have an `aria-label`
- [ ] Images have `alt`; decorative ones have `alt=""`
- [ ] Form inputs have an associated `<label>`, not just a placeholder
- [ ] Headings descend without skipping levels
- [ ] Dialogs carry `role="dialog"` and `aria-modal="true"`

**Content**

- [ ] Meaning is not conveyed by colour alone
- [ ] Async state changes are announced through a live region
- [ ] Error messages say what to do next, not only what went wrong
- [ ] New user-facing strings are in `messages/en.json`

**Responsive**

- [ ] Usable at 390px with no horizontal scroll
- [ ] Touch targets are at least 44×44px
- [ ] Animation respects `prefers-reduced-motion`

---

## Verifying this report

```bash
cd frontend
npm run test:e2e -- e2e/responsive.spec.ts e2e/overflow-clip.spec.ts
npm run test:visual                # catches unintended layout shifts
```

Manual checks that need a person:

1. **Keyboard-only.** Unplug the mouse and complete: browse → open a job →
   post a job → connect a wallet.
2. **Screen reader.** VoiceOver (macOS), NVDA (Windows) or Orca (Linux) on the
   same flow.
3. **Zoom.** 200% browser zoom on each page in the table.
4. **Contrast.** Browser devtools or an inspector against text and UI borders,
   in **both** light and dark themes.

---

## Updating this report

Update it in the same PR as the change, not afterwards:

- New feature → add its criteria rows and set an honest status
- Gap closed → move it out of [known gaps](#known-gaps) and update the criterion
- Gap found → add it, and link the issue once filed

**Do not upgrade a ⚪ to a ✅ without actually testing it.** A report that
overstates conformance is worse than no report, because it stops the work being
done.
