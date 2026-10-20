import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Every service test file boots its own in-memory Postgres (PGlite) and hashes passwords with scrypt (16 MB each).
    // With one worker per CPU the machine runs short of memory and scrypt fails with "Deriving bits failed".
    poolOptions: { forks: { minForks: 1, maxForks: 4 } },
    // The desktop app's tests need a DOM; the server's tests do not.
    environmentMatchGlobs: [['packages/app/**', 'jsdom']],
    setupFiles: ['packages/app/src/test-setup.ts'],
  },
});
