import {
  test, expect, env, seed, hydrated, htmlState, cookieString, hasCookie, DEFAULTS, NON_DEFAULT,
} from './fixtures';

for (const mode of ['script', 'server'] as const) {
  const url = `/${mode}`;

  test.describe(`ui: set / reset (${mode} mode)`, () => {
    test('set updates text, <html> reflection and document.cookie; reset restores defaults', async ({ page }) => {
      await page.goto(url);
      await hydrated(page);
      const t = (id: string) => page.getByTestId(id);

      await t('set-theme-dark').click();
      await expect(t('theme')).toHaveText('dark');
      await expect(page.locator('html')).toHaveClass(/\bdark\b/);
      expect((await htmlState(page)).cls).not.toContain('system');
      expect(hasCookie(await cookieString(page), 'theme', 'dark')).toBe(true);

      await t('set-theme-light').click();
      await expect(t('theme')).toHaveText('light');
      expect((await htmlState(page)).cls).toEqual(['light']);

      await t('toggle-sidebar').click();
      await expect(t('sidebar')).toHaveText('false');
      expect((await htmlState(page)).sidebar).toBe('false');
      expect(hasCookie(await cookieString(page), 'sidebar', 'false')).toBe(true);
      await t('toggle-sidebar').click();
      await expect(t('sidebar')).toHaveText('true');
      expect((await htmlState(page)).sidebar).toBe('true');

      await t('set-density-compact').click();
      await expect(t('density')).toHaveText('compact');
      expect((await htmlState(page)).density).toBe('compact');
      expect(hasCookie(await cookieString(page), 'density', 'compact')).toBe(true);

      await t('inc-pageSize').click();
      await expect(t('pageSize')).toHaveText('30');
      expect(hasCookie(await cookieString(page), 'pageSize', '30')).toBe(true);

      await t('set-locale-fr').click();
      await expect(t('locale')).toHaveText('fr');
      expect(hasCookie(await cookieString(page), 'locale', 'fr')).toBe(true);

      await t('set-columns').click();
      await expect(t('columns')).toHaveText('["a","b"]');
      expect(hasCookie(await cookieString(page), 'columns', encodeURIComponent('["a","b"]'))).toBe(true);

      // persists across reload
      await page.reload();
      await hydrated(page);
      await expect(t('theme')).toHaveText('light');
      await expect(t('density')).toHaveText('compact');
      await expect(t('columns')).toHaveText('["a","b"]');
      expect((await htmlState(page)).density).toBe('compact');

      for (const k of ['theme', 'sidebar', 'density', 'pageSize', 'locale', 'columns']) {
        await t(`reset-${k}`).click();
        await expect(t(k)).toHaveText(DEFAULTS[k as keyof typeof DEFAULTS]);
        expect(hasCookie(await cookieString(page), k), `cookie ${k} deleted`).toBe(false);
      }
      const s = await htmlState(page);
      expect(s.cls).toEqual(['system']);
      expect(s.sidebar).toBe('true');
      expect(s.density).toBe('cozy');
    });
  });

  test.describe(`crosstab: two pages, one context (${mode} mode)`, () => {
    test('a change in one tab shows up in the other without reload', async ({ context }) => {
      const a = await context.newPage();
      const b = await context.newPage();
      await a.goto(url);
      await b.goto(url);
      await hydrated(a);
      await hydrated(b);
      await b.evaluate(() => ((window as unknown as { __alive: boolean }).__alive = true));

      await a.getByTestId('toggle-sidebar').click();
      await expect(b.getByTestId('sidebar')).toHaveText('false');
      await expect.poll(async () => (await htmlState(b)).sidebar).toBe('false');

      await a.getByTestId('set-theme-dark').click();
      await expect(b.getByTestId('theme')).toHaveText('dark');
      await expect(b.locator('html')).toHaveClass(/\bdark\b/);

      await b.getByTestId('set-density-compact').click();
      await expect(a.getByTestId('density')).toHaveText('compact');

      await a.getByTestId('reset-theme').click();
      await expect(b.getByTestId('theme')).toHaveText('system');
      expect(await b.evaluate(() => (window as unknown as { __alive?: boolean }).__alive)).toBe(true);
    });
  });
}

const ROUTES = ['/script', '/script/rsc', '/script/action', '/server', '/server/action', '/theme'];

test.describe('hydration: no errors or warnings on any route', () => {
  for (const route of ROUTES) {
    test(`${route} (non-default cookies)`, async ({ page, context }, info) => {
      await seed(context, env(info).baseURL, route === '/theme' ? { theme: 'dark' } : NON_DEFAULT);
      await page.goto(route);
      await hydrated(page);
      if (route === '/theme') {
        for (const id of ['set-light', 'set-dark', 'set-system', 'toggle']) await page.getByTestId(id).click();
      } else {
        for (const id of [
          'set-theme-dark', 'set-theme-light', 'reset-theme', 'toggle-sidebar', 'reset-sidebar', 'set-density-compact',
          'reset-density', 'inc-pageSize', 'reset-pageSize', 'set-locale-fr', 'reset-locale', 'set-columns', 'reset-columns',
        ]) await page.getByTestId(id).click();
      }
      await page.reload();
      await hydrated(page);
      // the auto `watch` fixture fails the test on any console error / warning / page error
    });
  }
});
