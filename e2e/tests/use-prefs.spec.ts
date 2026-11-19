import { test, expect, env, seed, cookieHeader, textOf, hydrated, htmlState, cookieString, hasCookie, NON_DEFAULT, DEFAULTS } from './fixtures';

const keys = ['theme', 'sidebar', 'columns'] as const;

test.describe('usePrefs (server mode)', () => {
  test('the first HTML holds the cookie values, or the defaults', async ({ request }) => {
    const html = await (await request.get('/server', { headers: { cookie: cookieHeader(NON_DEFAULT) } })).text();
    for (const k of keys) expect(textOf(html, `batch-${k}`), k).toBe(NON_DEFAULT[k]);
    const plain = await (await request.get('/server', { headers: { cookie: '' } })).text();
    for (const k of keys) expect(textOf(plain, `batch-${k}`), k).toBe(DEFAULTS[k]);
  });

  // The `watch` fixture fails the test on any hydration warning or console error.
  test('hydrates without a warning; one patch updates DOM, <html> and cookies', async ({ page, context }, info) => {
    await seed(context, env(info).baseURL, NON_DEFAULT);
    await page.goto('/server');
    await hydrated(page);
    const t = (id: string) => page.getByTestId(id);
    for (const k of keys) await expect(t(`batch-${k}`)).toHaveText(NON_DEFAULT[k]);

    await t('batch-patch').click();
    await expect(t('batch-theme')).toHaveText('light');
    await expect(t('batch-sidebar')).toHaveText('true');
    await expect(t('batch-columns')).toHaveText('["a","b","c"]');
    // `usePref` on the same page follows the same store.
    await expect(t('theme')).toHaveText('light');
    await expect(t('sidebar')).toHaveText('true');
    const s = await htmlState(page);
    expect(s.cls).toEqual(['light']);
    expect(s.sidebar).toBe('true');
    const cookies = await cookieString(page);
    expect(hasCookie(cookies, 'theme', 'light')).toBe(true);
    expect(hasCookie(cookies, 'sidebar', 'true')).toBe(true);
    expect(hasCookie(cookies, 'columns', encodeURIComponent('["a","b","c"]'))).toBe(true);
    expect(hasCookie(cookies, 'density', 'compact')).toBe(true); // not in the patch

    // Written cookies reach the server.
    await page.reload();
    await hydrated(page);
    await expect(t('batch-columns')).toHaveText('["a","b","c"]');
  });
});
