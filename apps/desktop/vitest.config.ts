import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': `${src}/shared`,
      '@renderer': `${src}/renderer`,
    },
  },
  test: {
    name: 'desktop',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
