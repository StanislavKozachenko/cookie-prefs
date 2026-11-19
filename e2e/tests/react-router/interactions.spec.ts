import { seed, hydrated, htmlState, cookieString, hasCookie } from '../fixtures';
import { test, expect, IDS, DEFAULTS, NON_DEFAULT } from './helpers';

test.describe('react router ui: set / reset', () => {
  test('set updates text, <html> reflection and document.cookie; reset restores defaults', async ({ page }) => {
    await page.goto('/');
    await hydrated(page);
    const t = (id: string) => page.getByTestId(id);

    await t('set-theme-dark').click();
    await expect(t('theme')).toHaveText('dark');
    expect((await htmlState(page)).cls).toEqual(['dark']);
    expect(hasCookie(await cookieString(page), 'theme', 'dark')).toBe(true);

    await t('toggle-sidebar').click();
    await expect(t('sidebar')).toHaveText('false');
    expect((await htmlState(page)).sidebar).toBe('false');
    expect(hasCookie(await cookieString(page), 'sidebar', 'false')).toBe(true);

    await t('set-density-compact').click();
    await expect(t('density')).toHaveText('compact');
    expect((await htmlState(page)).density).toBe('compact');
    expect(hasCookie(await cookieString(page), 'density', 'compact')).toBe(true);

    await t('inc-pageSize').click();
    await expect(t('pageSize')).toHaveText('30');
    expect(hasCookie(await cookieString(page), 'pageSize', '30')).toBe(true);

    // the server renders the written cookies on reload
    await page.reload();
    await expect(t('loader-theme')).toHaveText('dark');
    await expect(t('loader-pageSize')).toHaveText('30');
    await hydrated(page);
    await expect(t('theme')).toHaveText('dark');
    await expect(t('sidebar')).toHaveText('false');
    expect((await htmlState(page)).density).toBe('compact');

    for (const id of IDS) {
      await t(`reset-${id}`).click();
      await expect(t(id)).toHaveText(DEFAULTS[id]);
      expect(hasCookie(await cookieString(page), id), `cookie ${id} deleted`).toBe(false);
    }
    const s = await htmlState(page);
    expect(s.cls).toEqual(['system']);
    expect(s.sidebar).toBe('true');
    expect(s.density).toBe('cozy');
  });

  test('client-side navigation: the next loader reads the written cookies, hooks keep them', async ({ page, context, baseURL }) => {
    await seed(context, baseURL!, NON_DEFAULT);
    await page.goto('/');
    await hydrated(page);
    await page.evaluate(() => ((window as unknown as { __alive: boolean }).__alive = true));
    await page.getByTestId('set-theme-light').click();
    await page.getByTestId('toggle-sidebar').click();

    await page.getByTestId('to-other').click();
    await expect(page.getByRole('heading', { name: 'Other' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive), 'no full reload').toBe(true);
    await expect(page.getByTestId('loader-theme')).toHaveText('light');
    await expect(page.getByTestId('loader-sidebar')).toHaveText('true');
    await expect(page.getByTestId('loader-density')).toHaveText('compact');
    await expect(page.getByTestId('theme')).toHaveText('light');
    await expect(page.getByTestId('sidebar')).toHaveText('true');
    const s = await htmlState(page);
    expect(s.cls).toEqual(['light']);
    expect(s.sidebar).toBe('true');
    expect(s.density).toBe('compact');
  });
});

test.describe('react router crosstab: two pages, one context', () => {
  test('a change in one tab shows up in the other without reload', async ({ context }) => {
    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto('/');
    await b.goto('/');
    await hydrated(a);
    await hydrated(b);
    await b.evaluate(() => ((window as unknown as { __alive: boolean }).__alive = true));

    await a.getByTestId('toggle-sidebar').click();
    await expect(b.getByTestId('sidebar')).toHaveText('false');
    await expect.poll(async () => (await htmlState(b)).sidebar).toBe('false');

    await a.getByTestId('set-theme-dark').click();
    await expect(b.getByTestId('theme')).toHaveText('dark');
    await expect.poll(async () => (await htmlState(b)).cls).toEqual(['dark']);

    await a.getByTestId('inc-pageSize').click();
    await expect(b.getByTestId('pageSize')).toHaveText('30');

    await a.getByTestId('reset-theme').click();
    await expect(b.getByTestId('theme')).toHaveText('system');
    expect(await b.evaluate(() => (window as unknown as { __alive?: boolean }).__alive), 'no reload').toBe(true);
  });
});
