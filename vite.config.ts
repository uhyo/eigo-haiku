import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works under any GitHub Pages subpath
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
