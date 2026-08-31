# Accessibility Testing Guide

## Overview

We use **axe-core** (via `vitest-axe`) for automated, component-level accessibility testing.
Every component rendered in the browser is checked against [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/quickref/) rules
as part of the normal `npm test` pipeline and CI.

## Quick Start

```tsx
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';

it('MyComponent has no a11y violations', async () => {
  const { container } = render(<MyComponent />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## How It Works

| Layer | Tool | Purpose |
|-------|------|---------|
| Matchers | `vitest-axe` | Provides `toHaveNoViolations()` matcher for Vitest |
| Engine | `axe-core` | Runs WCAG 2.1 AA rule checks against rendered DOM |
| Setup | `vitest.setup.ts` | Globally registers the axe matchers |
| CI | `.github/workflows/frontend.yml` | Runs all tests (including a11y) on every PR |

## Coverage Goals

- **100 %** of new presentational components must include an axe test.
- All existing components should be progressively covered (see `__tests__/accessibility.test.tsx`).
- CI must pass with **zero** axe violations before a PR can merge.

## Custom Rules for Stellar-Specific Patterns

You can pass rule overrides to `axe()` on a per-test basis:

```tsx
const results = await axe(container, {
  rules: {
    // Disable a rule for a justified reason
    'color-contrast': { enabled: false },
  },
});
```

### Patterns we watch for

| Pattern | What we check |
|---------|---------------|
| Wallet address truncation | `TruncatedAddress` must expose the full address to screen readers via `aria-label` |
| Network badge | Must convey network name via text, not colour alone |
| Status pills | Must include text labels, not just background colour |
| Transaction previews | Interactive elements must be keyboard-navigable |

## Adding Tests for a New Component

1. Open `frontend/__tests__/accessibility.test.tsx`.
2. Import the component.
3. Add an `it()` block that renders the component with representative props.
4. Assert `expect(results).toHaveNoViolations()`.
5. Run `npm test -- accessibility.test.tsx` locally to verify.

## Running Accessibility Tests

```bash
# Run only the accessibility tests
npm test -- accessibility.test.tsx

# Run all tests (includes accessibility)
npm test
```

## Resources

- [axe-core rule descriptions](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [vitest-axe documentation](https://github.com/chaance/vitest-axe)
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)