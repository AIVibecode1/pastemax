import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'electron/__tests__/**/*.test.ts'],
    // Component/hook tests opt into jsdom per file via the
    // `@vitest-environment jsdom` docblock (environmentMatchGlobs was removed
    // in vitest 4); everything else stays in node.
    setupFiles: ['./src/test/setup.ts'],
  },
});
