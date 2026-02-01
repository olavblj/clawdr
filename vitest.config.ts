import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30s timeout for API calls
    hookTimeout: 30000,
    sequence: {
      // Run tests in order (important for stateful API tests)
      shuffle: false,
    },
    // Reporter for better output
    reporters: ['verbose'],
  },
});
