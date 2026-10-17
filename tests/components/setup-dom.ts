/** jsdom gaps that Recharts and our components touch. Imported by component test files. */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}

// Vitest globals are off, so Testing Library's automatic cleanup is not registered.
afterEach(() => cleanup());
