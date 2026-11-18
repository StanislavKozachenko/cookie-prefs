import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  // The demo lives inside the package repository: keep Next from taking the repository's lockfile as the root.
  outputFileTracingRoot: root,
  turbopack: { root },
};
