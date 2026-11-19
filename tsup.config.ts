import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

/** Entries that are client modules and must start with the `'use client'` directive. */
const client = ['react/index', 'theme/index'];

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.tsx',
    'next/index': 'src/next/index.tsx',
    'script/index': 'src/script/index.ts',
    'theme/index': 'src/theme/index.tsx',
    'theme/server/index': 'src/theme/server/index.ts',
    'theme/next/index': 'src/theme/next/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  // Entries import each other by package name, so core state and the client
  // boundary exist once instead of being copied into every entry.
  external: ['react', 'next', 'cookie-prefs'],
  // Added after the build: tree shaking strips module-level directives, including a
  // `banner`, and one config keeps `clean` free of races between parallel builds.
  onSuccess: async () => {
    for (const entry of client)
      for (const ext of ['js', 'cjs']) {
        const file = `dist/${entry}.${ext}`;
        const code = await readFile(file, 'utf8');
        if (!code.startsWith("'use client'")) await writeFile(file, `'use client';\n${code}`);
      }
  },
});
