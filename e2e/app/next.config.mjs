import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // The app lives inside the package repository: keep Next from picking the repository's lockfile as the workspace root.
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
};
