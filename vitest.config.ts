import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Entries import each other by package name; tests run them from source.
    alias: [
      { find: /^cookie-prefs$/, replacement: src('index.ts') },
      { find: /^cookie-prefs\/react$/, replacement: src('react/index.tsx') },
      { find: /^cookie-prefs\/react\/batch$/, replacement: src('react/batch/index.tsx') },
      { find: /^cookie-prefs\/script$/, replacement: src('script/index.ts') },
      { find: /^cookie-prefs\/next$/, replacement: src('next/index.tsx') },
      { find: /^cookie-prefs\/theme\/server$/, replacement: src('theme/server/index.ts') },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
