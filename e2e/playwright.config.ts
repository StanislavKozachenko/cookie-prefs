import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// One Next major per run: E2E_NEXT=14|15|16 (set by scripts/run.mjs), the app is e2e/.apps/next<major>.
const major = process.env.E2E_NEXT ?? '16';
const port = 3100 + Number(major);
const ci = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  globalTimeout: 10 * 60_000, // a hang must not burn the job
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: process.env.WORKERS ? Number(process.env.WORKERS) : ci ? 2 : 4,
  retries: ci ? 1 : 0,
  forbidOnly: ci,
  reporter: ci ? [['github'], ['html', { open: 'never', outputFolder: 'report' }]] : [['dot']],
  outputDir: 'results',
  use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx next start -p ${port}`,
    cwd: path.resolve(__dirname, '.apps', `next${major}`),
    url: `http://localhost:${port}/script`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  },
});
