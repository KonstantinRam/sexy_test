import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // No tests exist yet in the types-only scaffold; don't fail on zero tests.
    passWithNoTests: true,
  },
});
