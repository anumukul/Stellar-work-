# Frontend Testing Strategy

This document outlines the testing approach, tools, coverage targets, and best practices for the frontend of the Stellar-work application. Our goal is to ensure high quality, maintainability, and reliability through a comprehensive testing strategy.

## Testing Tools and Setup

We utilize a modern, fast, and robust testing stack for our Next.js frontend:

*   **[Vitest](https://vitest.dev/):** Our primary test runner for unit and integration tests. It is fast, native to Vite/Next.js ecosystem, and provides a Jest-compatible API.
*   **[React Testing Library (RTL)](https://testing-library.com/docs/react-testing-library/intro/):** Used for rendering React components and interacting with them in tests. We focus on testing behavior from the user's perspective rather than implementation details.
*   **[Playwright](https://playwright.dev/):** Used for End-to-End (E2E) and visual regression testing across different browsers.
*   **[Storybook](https://storybook.js.org/):** Used for UI component isolation, visual testing, and documenting our design system.
*   **jsdom:** Provides a browser-like environment for Vitest to run DOM-related tests.

### Setup

To run the tests locally, use the following scripts defined in `package.json`:

*   **Unit & Integration Tests:** `npm run test`
*   **Watch Mode:** `npm run test:watch`
*   **Test Coverage:** `npm run test:coverage`
*   **E2E Tests:** `npm run test:e2e`
*   **Visual Regression Tests:** `npm run test:visual`

## The Test Pyramid

Our testing strategy follows the standard Test Pyramid, balancing execution speed and confidence.

### 1. Unit Tests (Base of the Pyramid)
*   **Scope:** Individual functions, hooks, utilities, and small isolated UI components.
*   **Goal:** Verify that the smallest pieces of code work correctly in isolation.
*   **Tools:** Vitest, React Testing Library.
*   **Volume:** High. These should make up the majority of our tests as they are fast and easy to write.

### 2. Integration Tests (Middle of the Pyramid)
*   **Scope:** Interactions between multiple components, state management (e.g., context, hooks), and data fetching interactions (mocked).
*   **Goal:** Ensure that different parts of the application work together correctly.
*   **Tools:** Vitest, React Testing Library.
*   **Volume:** Medium. Focus on critical user flows and complex state changes.

### 3. End-to-End (E2E) Tests (Top of the Pyramid)
*   **Scope:** The entire application stack (frontend + backend/contracts).
*   **Goal:** Verify critical user journeys (e.g., wallet connection, signing transactions) in a real browser environment.
*   **Tools:** Playwright.
*   **Volume:** Low. These are slower and more brittle, so we reserve them for the most critical paths.

## Coverage Targets

We enforce code coverage thresholds to maintain a high standard of quality. Coverage is measured using Vitest's V8 provider.

Our current target thresholds per module are:

| Module / Area | Statements | Branches | Functions | Lines |
| :--- | :--- | :--- | :--- | :--- |
| **Global / Overall** | 80% | 75% | 80% | 80% |
| `components/ui/` | 90% | 85% | 90% | 90% |
| `hooks/` | 85% | 80% | 85% | 85% |
| `utils/` | 95% | 90% | 95% | 95% |
| `lib/` (API/Stellar) | 85% | 80% | 85% | 85% |
| `app/` (Pages/Routes) | 70% | 65% | 70% | 70% |

*Note: E2E test files, Storybook stories, and configuration files are excluded from coverage metrics.*

## Examples of Good Test Patterns

### 1. Testing a UI Component (React Testing Library)
Focus on accessible roles and user interactions.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders correctly with children', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={handleClick}>Submit</Button>);
    
    await user.click(screen.getByRole('button', { name: /submit/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### 2. Testing a Custom Hook
Isolate hook logic using `renderHook`.

```tsx
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('should increment the counter', () => {
    const { result } = renderHook(() => useCounter(0));
    
    expect(result.current.count).toBe(0);
    
    act(() => {
      result.current.increment();
    });
    
    expect(result.current.count).toBe(1);
  });
});
```

### 3. Mocking Dependencies
Use `vi.mock` to isolate the unit under test from external APIs or complex dependencies.

```tsx
import { vi } from 'vitest';
import { fetchWalletBalance } from '@/lib/stellar';

// Mock the module
vi.mock('@/lib/stellar', () => ({
  fetchWalletBalance: vi.fn(),
}));

describe('WalletDashboard', () => {
  it('displays the balance when loaded', async () => {
    // Setup mock return value
    vi.mocked(fetchWalletBalance).mockResolvedValue('100.50');
    // ... render component and assert
  });
});
```

## CI Integration Details

Our Continuous Integration (CI) pipeline (via GitHub Actions) is configured to automatically run tests on every Pull Request and push to the `main` branch.

The CI pipeline executes the following steps for the frontend:
1.  **Linting & Type Checking:** Runs `npm run lint` and `npm run typecheck` to catch static errors.
2.  **Unit & Integration Tests:** Runs `npm run test:coverage` to execute Vitest tests and generate a coverage report. The build will fail if the global coverage thresholds are not met.
3.  **E2E Tests:** Runs `npm run test:e2e` using Playwright on a matrix of supported browsers (Chromium, Firefox, WebKit).
4.  **Visual Regression (Chromatic):** Runs `npm run chromatic` to build Storybook and detect visual changes in UI components.

Pull Requests cannot be merged unless all CI checks, including testing and coverage thresholds, pass successfully.
