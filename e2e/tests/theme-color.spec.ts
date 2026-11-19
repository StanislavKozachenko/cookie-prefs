import type { Page } from '@playwright/test';
import { test, expect, env, seed, hydrated, blockHydration, recordCsp, cspViolations } from './fixtures';

const LIGHT = '#ffffff';
const DARK = '#0a0a0a';
const OURS = { media: null, ours: true };

/** Every `<meta name="theme-color">` in document order. */
const tags = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('meta[name="theme-color"]')).map((m) => ({
      content: m.getAttribute('content'),
      media: m.getAttribute('media'),
      ours: m.getAttribute('property') === 'cookie-prefs',
    })),
  );

/** The colour the browser uses: the first tag whose `media` matches (HTML spec). */
const shown = (page: Page) =>
  page.evaluate(() => {
    for (const m of Array.from(document.querySelectorAll('meta[name="theme-color"]'))) {
      const media = m.getAttribute('media');
      if (!media || matchMedia(media).matches) return m.getAttribute('content');
    }
    return null;
  });

/** Records the first theme-color tag when parsing ends and at `DOMContentLoaded`, before hydration. */
const recordColor = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __color: Record<string, unknown> };
    w.__color = {};
    const snap = (k: string) => {
      if (k in w.__color) return;
      const m = document.querySelector('meta[name="theme-color"]');
      w.__color[k] = {
        content: m?.getAttribute('content') ?? null,
        ours: m?.getAttribute('property') === 'cookie-prefs',
        hydrated: document.querySelector('[data-testid="hydrated"]')?.textContent ?? null,
      };
    };
    document.addEventListener('readystatechange', () => snap(document.readyState));
    document.addEventListener('DOMContentLoaded', () => snap('DOMContentLoaded'));
  });

const early = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __color: Record<string, { content: string | null; ours: boolean; hydrated: string | null }> }).__color,
  );

const expectEarly = async (page: Page, content: string) => {
  const e = await early(page);
  for (const k of ['interactive', 'DOMContentLoaded']) {
    expect(e[k], `theme-color at ${k}`).toMatchObject({ content, ours: true });
    expect(e[k]!.hydrated, `not hydrated at ${k}`).not.toBe('yes');
  }
};

test.describe('theme-color: ThemeColor from cookie-prefs/theme/color', () => {
  test.use({ colorScheme: 'light' });

  test('server HTML has the script and no tag; the tag is right before hydration', async ({ page, context, request, watch }, info) => {
    const html = await (await request.get('/theme-color', { headers: { cookie: 'theme=dark' } })).text();
    expect(html).toContain('(function(C){');
    expect(html).not.toMatch(/<meta[^>]*theme-color/);

    await seed(context, env(info).baseURL, { theme: 'dark' });
    await recordColor(page);
    await page.goto('/theme-color');
    await hydrated(page);
    await expectEarly(page, DARK);
    expect(await tags(page)).toEqual([{ content: DARK, ...OURS }]);

    // and with hydration impossible
    const p2 = await context.newPage();
    await blockHydration(p2, watch);
    await p2.goto('/theme-color');
    await expect(p2.getByTestId('hydrated')).toHaveText('no');
    expect(await tags(p2)).toEqual([{ content: DARK, ...OURS }]);
  });

  test('follows setTheme; a theme without a colour removes the tag', async ({ page }) => {
    await page.goto('/theme-color');
    await hydrated(page);
    expect(await tags(page)).toEqual([{ content: LIGHT, ...OURS }]); // system, OS light
    await page.getByTestId('set-dark').click();
    await expect.poll(() => tags(page)).toEqual([{ content: DARK, ...OURS }]);
    await page.getByTestId('set-sepia').click();
    await expect(page.getByTestId('theme')).toHaveText('sepia');
    await expect.poll(() => tags(page)).toEqual([]);
    await page.getByTestId('set-light').click();
    await expect.poll(() => tags(page)).toEqual([{ content: LIGHT, ...OURS }]);
    await page.getByTestId('set-dark').click();
    await expect.poll(() => tags(page)).toEqual([{ content: DARK, ...OURS }]);

    await recordColor(page);
    await page.reload();
    await hydrated(page);
    await expectEarly(page, DARK);
  });

  test('system: follows the OS scheme before hydration and live', async ({ page, watch }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    const p2 = await page.context().newPage();
    await p2.emulateMedia({ colorScheme: 'dark' });
    await blockHydration(p2, watch);
    await p2.goto('/theme-color');
    expect(await tags(p2), 'inline script resolves system').toEqual([{ content: DARK, ...OURS }]);
    await p2.close();

    await page.goto('/theme-color');
    await hydrated(page);
    await expect(page.getByTestId('theme')).toHaveText('system');
    expect(await tags(page)).toEqual([{ content: DARK, ...OURS }]);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.getByTestId('resolved')).toHaveText('light');
    await expect.poll(() => tags(page)).toEqual([{ content: LIGHT, ...OURS }]);
  });

  test('cross-tab: setTheme in one page reaches the other', async ({ context }) => {
    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto('/theme-color');
    await b.goto('/theme-color');
    await hydrated(a);
    await hydrated(b);
    await a.getByTestId('set-dark').click();
    await expect.poll(() => tags(b)).toEqual([{ content: DARK, ...OURS }]);
  });

  test('comes before viewport.themeColor, across client navigations', async ({ page, context, watch }, info) => {
    // OS dark, stored light: the app's media tags alone would show dark
    await page.emulateMedia({ colorScheme: 'dark' });
    await seed(context, env(info).baseURL, { theme: 'light' });
    const pairs = [
      { content: LIGHT, media: '(prefers-color-scheme: light)', ours: false },
      { content: DARK, media: '(prefers-color-scheme: dark)', ours: false },
    ];

    const p2 = await context.newPage();
    await p2.emulateMedia({ colorScheme: 'dark' });
    await blockHydration(p2, watch);
    await p2.goto('/theme-color/viewport');
    expect(await tags(p2), 'before hydration').toEqual([{ content: LIGHT, ...OURS }, ...pairs]);
    expect(await shown(p2)).toBe(LIGHT);
    await p2.close();

    await page.goto('/theme-color/viewport');
    await hydrated(page);
    expect(await tags(page), 'after hydration: no duplicate').toEqual([{ content: LIGHT, ...OURS }, ...pairs]);
    expect(await shown(page)).toBe(LIGHT);

    await page.getByTestId('to-other').click();
    await expect(page.getByTestId('page')).toHaveText('other');
    await expect.poll(() => tags(page)).toEqual([{ content: LIGHT, ...OURS }, { content: '#ff0000', media: null, ours: false }]);
    await page.getByTestId('to-viewport').click();
    await expect(page.getByTestId('page')).toHaveText('viewport');
    await expect.poll(() => tags(page)).toEqual([{ content: LIGHT, ...OURS }, ...pairs]);

    // no colour for sepia: the app's tags apply
    await page.getByTestId('set-sepia').click();
    await expect.poll(() => tags(page)).toEqual(pairs);
    expect(await shown(page)).toBe(DARK);
    await page.getByTestId('set-dark').click();
    await expect.poll(() => tags(page)).toEqual([{ content: DARK, ...OURS }, ...pairs]);
    await page.getByTestId('to-plain').click();
    await expect(page.getByTestId('page')).toHaveText('plain');
    await expect.poll(() => tags(page)).toEqual([{ content: DARK, ...OURS }]);
    await page.getByTestId('to-other').click();
    await expect(page.getByTestId('page')).toHaveText('other');
    await page.getByTestId('set-light').click();
    await expect.poll(() => tags(page)).toEqual([{ content: LIGHT, ...OURS }, { content: '#ff0000', media: null, ours: false }]);
  });

  test('forcedTheme: the forced theme colour whatever is stored', async ({ page, context, watch }, info) => {
    await seed(context, env(info).baseURL, { theme: 'light' });
    const p2 = await context.newPage();
    await blockHydration(p2, watch);
    await p2.goto('/forced');
    expect(await tags(p2)).toEqual([{ content: DARK, ...OURS }]);
    await p2.close();

    await page.goto('/forced');
    await hydrated(page);
    expect(await tags(page)).toEqual([{ content: DARK, ...OURS }]);
    await page.getByTestId('set-light').click();
    await expect(page.getByTestId('theme')).toHaveText('light');
    expect(await tags(page)).toEqual([{ content: DARK, ...OURS }]);
  });
});

test.describe('theme-color under a strict CSP', () => {
  test('nonce: the script runs before hydration without a violation', async ({ page, context, env }) => {
    await seed(context, env.baseURL, { ctheme: 'dark' });
    await recordCsp(page);
    await recordColor(page);
    await page.goto('/csp');
    await hydrated(page);
    await expectEarly(page, DARK);
    await page.getByTestId('set-light').click();
    await expect.poll(() => tags(page)).toEqual([{ content: LIGHT, ...OURS }]);
    expect(await cspViolations(page)).toEqual([]);
  });

  test('Trusted Types: hydrated page follows the theme and provider prop changes do not throw', async ({ page, context, env }) => {
    await seed(context, env.baseURL, { ctheme: 'dark' });
    await recordCsp(page);
    await recordColor(page);
    await page.goto('/tt');
    await hydrated(page);
    await expectEarly(page, DARK);
    await page.getByTestId('set-light').click();
    await expect.poll(() => tags(page)).toEqual([{ content: LIGHT, ...OURS }]);
    await page.getByTestId('prop-disable').click();
    await page.getByTestId('prop-attribute').click();
    await expect(page.getByTestId('prop-state')).toHaveText('data-theme|false|system');
    await page.getByTestId('set-dark').click();
    await expect.poll(() => tags(page)).toEqual([{ content: DARK, ...OURS }]);
    expect(await cspViolations(page)).toEqual([]);
  });
});
