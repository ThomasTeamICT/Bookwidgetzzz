import { defineConfig } from 'vitest/config';

// Testrunner voor de scoringsmotor.
//
// Alleen src/**/*.test.ts telt mee: de Playwright-rooktest in tests/smoke.mjs
// draait in een echte browser en heeft een ander runtime-profiel — die mag
// vitest niet oppikken.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'tests/**'],
    // De graders zijn pure functies: geen DOM nodig, dus geen jsdom.
    environment: 'node',
    globals: false,
    clearMocks: true,
  },
});
