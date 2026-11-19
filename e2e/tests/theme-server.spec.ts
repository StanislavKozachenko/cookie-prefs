import { test, expect, env, seed, textOf, hydrated } from './fixtures';

/** `class` of `<html>` in raw HTML; `null` when it has none. */
const htmlClass = (html: string) => {
  const tag = /<html\b[^>]*>/.exec(html)?.[0] ?? '';
  return /\sclass="([^"]*)"/.exec(tag)?.[1] ?? null;
};

const cls = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.className.split(/\s+/).filter(Boolean).sort());

test.describe('theme: getTheme() from cookie-prefs/theme/next renders the stored theme on the server', () => {
  test.use({ colorScheme: 'light' });

  test('server HTML carries the stored theme', async ({ request }) => {
    for (const theme of ['dark', 'light']) {
      const html = await (await request.get('/theme-server', { headers: { cookie: `theme=${theme}` } })).text();
      expect(htmlClass(html), `<html> class for ${theme}`).toBe(theme);
      expect(textOf(html, 'server-theme')).toBe(theme);
      expect(html).toContain(`class="theme-${theme}"`);
      // the client hook still renders undefined until hydration, as in next-themes
      expect(textOf(html, 'theme')).toBe('');
    }
  });

  test('an invalid, malformed or missing cookie gives the default; system is not resolved on the server', async ({ request }) => {
    for (const cookie of ['theme=blue', 'theme=%E0%A4%A', 'theme=', 'theme=system', '']) {
      const html = await (await request.get('/theme-server', { headers: { cookie } })).text();
      expect(htmlClass(html), cookie).toBeNull();
      expect(textOf(html, 'server-theme'), cookie).toBe('system');
    }
  });

  test('hydrates without warnings and keeps the server class', async ({ page, context }, info) => {
    await seed(context, env(info).baseURL, { theme: 'dark' });
    const res = await page.goto('/theme-server');
    expect(htmlClass(await res!.text())).toBe('dark');
    await hydrated(page);
    await expect(page.getByTestId('theme')).toHaveText('dark');
    await expect(page.getByTestId('server-theme')).toHaveText('dark');
    expect(await cls(page)).toEqual(['dark']);
  });

  test('system: no class from the server, the inline script resolves it', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    const res = await page.goto('/theme-server');
    expect(htmlClass(await res!.text())).toBeNull();
    await hydrated(page);
    await expect(page.getByTestId('server-theme')).toHaveText('system');
    await expect(page.getByTestId('resolved')).toHaveText('dark');
    expect(await cls(page)).toEqual(['dark']);
  });

  test('after setTheme and a reload the server HTML follows', async ({ page }) => {
    await page.goto('/theme-server');
    await hydrated(page);
    for (const theme of ['dark', 'light'] as const) {
      await page.getByTestId(`set-${theme}`).click();
      await expect(page.getByTestId('theme')).toHaveText(theme);
      const res = await page.reload();
      const html = await res!.text();
      expect(htmlClass(html), `<html> class after setTheme('${theme}')`).toBe(theme);
      expect(textOf(html, 'server-theme')).toBe(theme);
      await hydrated(page);
      await expect(page.getByTestId('server-theme')).toHaveText(theme);
      expect(await cls(page)).toEqual([theme]);
    }
  });
});
