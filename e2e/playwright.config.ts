import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// One app per run (set by scripts/run.mjs): E2E_NEXT=14|15|16 tests e2e/.apps/next<major> with the specs in tests/,
// E2E_APP=react-router tests e2e/react-router with the specs in tests/react-router/.
const reactRouter = process.env.E2E_APP === 'react-router';
const major = process.env.E2E_NEXT ?? '16';
const port = reactRouter ? 3200 : 3100 + Number(major);
const ci = !!process.env.CI;

export default defineConfig({
  testDir: reactRouter ? './tests/react-router' : './tests',
  testIgnore: reactRouter ? [] : ['react-router/**'],
  timeout: 30_000,
  globalTimeout: 10 * 60_000, // a hang must not burn the job
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: process.env.WORKERS ? Number(process.env.WORKERS) : ci ? 2 : 4,
  retries: ci ? 1 : 0,
  forbidOnly: ci,
  reporter: ci ? [['github'], ['html', { open: 'never', outputFolder: 'report' }]] : [['dot']],
  outputDir: 'results',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  // One production server serves every project: the app is built once per run, whatever the browser.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: reactRouter
    ? {
        command: 'npx react-router-serve ./build/server/index.js',
        cwd: path.resolve(__dirname, 'react-router'),
        url: `http://localhost:${port}/`,
        reuseExistingServer: false,
        timeout: 60_000,
        env: { PORT: String(port), NODE_ENV: 'production' },
      }
    : {
        command: `npx next start -p ${port}`,
        cwd: path.resolve(__dirname, '.apps', `next${major}`),
        url: `http://localhost:${port}/script`,
        reuseExistingServer: false,
        timeout: 60_000,
        env: { NEXT_TELEMETRY_DISABLED: '1' },
      },
});
