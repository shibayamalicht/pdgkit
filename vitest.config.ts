import { defineConfig } from 'vitest/config';

// A local config so vitest does not climb to a parent project's vite config.
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
  },
});
