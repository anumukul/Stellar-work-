import '@testing-library/jest-dom'
import { crypto } from 'node:crypto'

// Polyfill crypto for stellar-sdk in node/jsdom environment
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = crypto
}
