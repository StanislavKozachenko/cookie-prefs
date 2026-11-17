import { test, expect, env, seed, hydrated, blockHydration, recordEarly, early, cookieString, hasCookie } from './fixtures';

const cls = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.className.split(/\s+/).filter(Boolean).sort());

test.describe('theme: cookie-prefs/theme with attribute="class"', () => {
  test.use({ colorScheme: 'light' });

  test('toggle switches the class on <html> and writes the cookie', async ({ page }) => {
    await page.goto('/theme');
    await hydrated(page);
    await expect(page.getByTestId('theme')).toHaveText('system');
    await page.getByTestId('set-dark').click();
    await expect(page.getByTestId('theme')).toHaveText('dark');
    expect(await cls(page)).toEqual(['dark']);
    expect(hasCookie(await cookieString(page), 'theme', 'dark')).toBe(true);
    await page.getByTestId('toggle').click();
    await expect(page.getByTestId('resolved')).toHaveText('light');
    expect(await cls(page)).toEqual(['light']);
    await page.getByTestId('set-system').click();
    await expect(page.getByTestId('theme')).toHaveText('system');
    expect(await cls(page)).toEqual(['light']); // OS is light
  });

  test('survives reload without a flash (class present before hydration)', async ({ page, context, watch }, info) => {
    await page.goto('/theme');
    await hydrated(page);
    await page.getByTestId('set-dark').click();
    await expect(page.getByTestId('theme')).toHaveText('dark');

    await recordEarly(page);
    await page.reload();
    await hydrated(page);
    const e = await early(page);
    expect(e.readystatechange!.cls.split(/\s+/)).toContain('dark');
    expect(e.DOMContentLoaded!.cls.split(/\s+/)).toContain('dark');
    await expect(page.getByTestId('theme')).toHaveText('dark');

    // and with hydration impossible
    const p2 = await context.newPage();
    await blockHydration(p2, watch);
    await p2.goto('/theme');
    await expect(p2.getByTestId('hydrated')).toHaveText('no');
    expect(await cls(p2)).toEqual(['dark']);
  });

  for (const scheme of ['dark'] as const) {
    test(`system: follows prefers-color-scheme=${scheme} before hydration and live`, async ({ page, watch }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const p2 = await page.context().newPage();
      await p2.emulateMedia({ colorScheme: scheme });
      await blockHydration(p2, watch);
      await p2.goto('/theme');
      expect(await cls(p2), 'inline script resolves system').toEqual([scheme]);
      await p2.close();

      await page.goto('/theme');
      await hydrated(page);
      await expect(page.getByTestId('theme')).toHaveText('system');
      await expect(page.getByTestId('resolved')).toHaveText(scheme);
      const other = scheme === 'dark' ? 'light' : 'dark';
      await page.emulateMedia({ colorScheme: other });
      await expect(page.getByTestId('resolved')).toHaveText(other);
      await expect(page.getByTestId('theme')).toHaveText('system');
      await expect.poll(() => cls(page)).toEqual([other]);
    });
  }

  test('next-themes value in localStorage is picked up when there is no cookie', async ({ page, context, watch }) => {
    await page.goto('/theme');
    await hydrated(page);
    await context.clearCookies();
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));

    // before hydration: the inline script already shows it
    const p2 = await context.newPage();
    await blockHydration(p2, watch);
    await p2.goto('/theme');
    expect(await cls(p2), 'inline script reads localStorage').toEqual(['dark']);
    await p2.close();

    await page.reload();
    await hydrated(page);
    await expect(page.getByTestId('theme')).toHaveText('dark');
    expect(await cls(page)).toEqual(['dark']);
    await expect.poll(async () => hasCookie(await cookieString(page), 'theme', 'dark'), 'migrated to the cookie').toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('theme')), 'localStorage key removed once the cookie holds the value (current contract)').toBeNull();
  });

  test('a cookie wins over localStorage', async ({ page, context }, info) => {
    await page.goto('/theme');
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.goto('about:blank'); // no live provider while the cookie changes
    await seed(context, env(info).baseURL, { theme: 'light' });
    await page.goto('/theme');
    await hydrated(page);
    await expect(page.getByTestId('theme')).toHaveText('light');
    expect(await cls(page)).toEqual(['light']);
  });

  test('cross-tab: setTheme in one page reaches the other', async ({ context }) => {
    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto('/theme');
    await b.goto('/theme');
    await hydrated(a);
    await hydrated(b);
    await a.getByTestId('set-dark').click();
    await expect(b.getByTestId('theme')).toHaveText('dark');
    await expect.poll(() => cls(b)).toEqual(['dark']);
  });
});
