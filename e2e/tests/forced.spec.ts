import { test, expect, hydrated, seed, recordEarly, early, htmlState, cookieString, hasCookie } from './fixtures';

test.describe('forcedTheme="dark"', () => {
  test('shows dark whatever is stored; setTheme stores the choice without changing the class; sibling shows the stored theme', async ({ page, context, env }) => {
    await seed(context, env.baseURL, { theme: 'light' });
    await recordEarly(page);
    await page.goto('/forced');
    const e = await early(page);
    expect(e.readystatechange!.cls.split(/\s+/)).toContain('dark');
    expect(e.readystatechange!.cls.split(/\s+/)).not.toContain('light');
    await hydrated(page);
    expect((await htmlState(page)).cls).toEqual(['dark']);
    await expect(page.getByTestId('theme')).toHaveText('light'); // stored choice

    await page.getByTestId('set-system').click();
    await expect.poll(async () => hasCookie(await cookieString(page), 'theme', 'system')).toBe(true);
    await page.getByTestId('set-light').click();
    await expect.poll(async () => hasCookie(await cookieString(page), 'theme', 'light')).toBe(true);
    expect((await htmlState(page)).cls).toEqual(['dark']);
    await page.getByTestId('set-dark').click();
    await page.getByTestId('set-light').click();
    expect((await htmlState(page)).cls).toEqual(['dark']);
    expect(hasCookie(await cookieString(page), 'theme', 'light')).toBe(true);

    // reload: still forced
    await page.reload();
    await hydrated(page);
    expect((await htmlState(page)).cls).toEqual(['dark']);

    // sibling page without forcedTheme shows the stored choice
    await page.goto('/theme');
    await hydrated(page);
    expect((await htmlState(page)).cls).toEqual(['light']);
    await expect(page.getByTestId('theme')).toHaveText('light');
  });
});
