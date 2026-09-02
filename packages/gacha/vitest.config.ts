import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'gacha',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
