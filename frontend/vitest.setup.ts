import '@testing-library/jest-dom/vitest'
import { crypto } from 'node:crypto'

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  } as Storage;
}

// Polyfill crypto for stellar-sdk in node/jsdom environment
if (!globalThis.crypto) {
  // @ts-expect-error - jsdom needs a crypto polyfill for stellar-sdk
  globalThis.crypto = crypto
}

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createStorage(),
    configurable: true,
  })
}

if (!globalThis.sessionStorage || typeof globalThis.sessionStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: createStorage(),
    configurable: true,
  })
}
