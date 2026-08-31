/**
 * TypeScript augmentation for vitest + jest-dom matchers.
 *
 * `vitest.setup.ts` is excluded from type-checking (see tsconfig.json),
 * so the `@testing-library/jest-dom/vitest` module augmentation is
 * registered here instead, giving `expect(...)` the jest-dom matchers
 * (toBeInTheDocument, toHaveClass, …) in every test file.
 */
import "@testing-library/jest-dom/vitest";
