import { execFileSync } from 'node:child_process';
import { test, expect, hydrated } from './fixtures';

test.describe('cookie refresh only for long-lived prefs', () => {
  test('a short maxAge cookie keeps its expiry on load, a default one is re-written', async ({ page, context, env }) => {
    const now = Math.floor(Date.now() / 1000);
    const shortExp = now + 1000; // a re-write with Max-Age 3600 would move this to now + 3600
    const longExp = now + 100 * 86400; // a re-write with Max-Age 400 days would move this to now + 400 days
    await context.addCookies([
      { name: 'recent', value: 'abc', url: env.baseURL, expires: shortExp },
      { name: 'density', value: 'compact', url: env.baseURL, expires: longExp },
    ]);
    const expiry = async (name: string) => (await context.cookies()).find((c) => c.name === name)?.expires;
    expect(await expiry('recent')).toBeCloseTo(shortExp, -1);
    expect(await expiry('density')).toBeCloseTo(longExp, -1);

    await page.goto('/script');
    await hydrated(page);
    await expect(page.getByTestId('recent')).toHaveText('abc');
    await expect.poll(async () => (await expiry('density'))!, { message: 'default pref is refreshed on load' }).toBeGreaterThan(now + 300 * 86400);
    expect(await expiry('recent'), 'short-lived pref is not refreshed').toBeCloseTo(shortExp, -1);

    await page.reload();
    await hydrated(page);
    await page.waitForTimeout(300);
    expect(await expiry('recent'), 'still not refreshed after a reload').toBeCloseTo(shortExp, -1);

    // set() writes with the configured Max-Age
    await page.getByTestId('set-recent').click();
    await expect.poll(async () => (await expiry('recent'))!).toBeGreaterThan(now + 3000);
    expect((await expiry('recent'))!).toBeLessThan(now + 3700);
  });
});

test('plain Node can import cookie-prefs/next (no ERR_MODULE_NOT_FOUND)', async ({ env }) => {
  const out = execFileSync('node', ['-e', "import('cookie-prefs/next').then(m=>console.log(Object.keys(m)))"], {
    cwd: env.appDir,
    encoding: 'utf8',
  });
  expect(out).toContain('PrefsProvider');
  expect(out).toContain('getPrefs');
});
