import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.js'],
    include: ['services/**/*.test.js'],
    exclude: ['test/**/*.integration.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['services/**/*.js'],
      exclude: ['services/**/*.test.js'],
    },
  },
});
