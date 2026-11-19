import {
  test, expect, env, seed, cookieHeader, textOf, hydrated, htmlState, recordEarly, early, cookieString, hasCookie,
} from './fixtures';

// `density` maps the old name `tight` to `compact` with `.migrate()` (e2e/app/app/prefs.ts).
test.describe('migrate: an old enum name reads as its current value', () => {
  test('server: getPrefs and the hooks render the current value in the first HTML', async ({ request }) => {
    const html = await (await request.get('/server', { headers: { cookie: cookieHeader({ density: 'tight' }) } })).text();
    expect(textOf(html, 'rsc-density')).toBe('compact');
    expect(textOf(html, 'density')).toBe('compact');
  });

  for (const mode of ['script', 'server'] as const)
    test(`${mode} mode: reflected before hydration, no mismatch, rewritten only by set()`, async ({ page, context }, info) => {
      await seed(context, env(info).baseURL, { density: 'tight' });
      await recordEarly(page);
      await page.goto(`/${mode}`);
      await hydrated(page);
      const e = await early(page);
      expect(e.DOMContentLoaded!.density, 'data-density before hydration').toBe('compact');
      await expect(page.getByTestId('density')).toHaveText('compact');
      expect((await htmlState(page)).density).toBe('compact');
      expect(hasCookie(await cookieString(page), 'density', 'tight'), 'reads never rewrite the cookie').toBe(true);

      await page.getByTestId('set-density-compact').click();
      await expect.poll(async () => hasCookie(await cookieString(page), 'density', 'compact')).toBe(true);
      await expect(page.getByTestId('density')).toHaveText('compact');
    });
});
