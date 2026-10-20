import { afterEach } from 'vitest';

// Only the app's (jsdom) tests have a document; the service's tests run in plain Node.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
}
