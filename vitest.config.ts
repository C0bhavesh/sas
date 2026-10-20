import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    // Every service test file boots its own in-memory Postgres (PGlite) and hashes passwords with scrypt (16 MB each).
    // With one worker per CPU the machine runs short of memory and scrypt fails with "Deriving bits failed".
    maxWorkers: 4,
    projects: [
      {
        // The server side runs in plain Node.
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['packages/shared/src/**/*.test.{ts,tsx}', 'packages/service/src/**/*.test.{ts,tsx}'],
        },
      },
      {
        // The desktop app's tests need a DOM.
        extends: true,
        test: {
          name: 'app',
          environment: 'jsdom',
          include: ['packages/app/src/**/*.test.{ts,tsx}'],
          setupFiles: ['packages/app/src/test-setup.ts'],
        },
      },
    ],
  },
});
