import { seed, hydrated, htmlState, recordEarly, early } from '../fixtures';
import { test, expect, NON_DEFAULT, blockHydration } from './helpers';

// <PrefsProvider script={prefsScript(prefs)}> at the top of <body>, rendered by the root `Layout`.
test.describe('react router script: <html> reflection before hydration', () => {
  test('raw HTML has the blocking inline script before the content', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const m = /<script[^>]*>\(function\(P\)\{[^<]*\}\)\("([^<]*)"\)<\/script>/.exec(html);
    expect(m, 'inline prefs script in first HTML').not.toBeNull();
    expect(m![0]).toContain('data-sidebar');
    expect(m![0]).toContain('data-density');
    expect(html).toMatch(/<script type="text\/javascript">\(function\(P\)/);
    const scriptAt = html.indexOf('(function(P)');
    expect(scriptAt, 'script follows <body>').toBeGreaterThan(html.indexOf('<body'));
    expect(scriptAt, 'script precedes page content').toBeLessThan(html.indexOf('data-testid="hydrated"'));
  });

  test('attributes are on <html> at readystatechange and DOMContentLoaded, before hydration', async ({ page, context, baseURL }) => {
    await seed(context, baseURL!, NON_DEFAULT);
    await recordEarly(page);
    await page.goto('/');
    await hydrated(page);
    const e = await early(page);
    expect(e.readystatechange, 'snapshot at readystatechange').toBeTruthy();
    expect(e.readystatechange!.hydrated, 'not hydrated yet at readystatechange').toBe('no');
    for (const k of ['readystatechange', 'DOMContentLoaded'] as const) {
      expect(e[k], `snapshot ${k} exists`).toBeTruthy();
      expect(e[k]!.cls.split(/\s+/), `${k}: class`).toContain('dark');
      expect(e[k]!.sidebar, `${k}: data-sidebar`).toBe('false');
      expect(e[k]!.density, `${k}: data-density`).toBe('compact');
    }
  });

  test('attributes are set even if the page never hydrates (all chunks blocked)', async ({ page, context, baseURL }) => {
    await seed(context, baseURL!, NON_DEFAULT);
    await blockHydration(page);
    await page.goto('/');
    await expect(page.getByTestId('theme')).toHaveText('dark');
    await expect(page.getByTestId('hydrated')).toHaveText('no');
    const s = await htmlState(page);
    expect(s.cls).toEqual(['dark']);
    expect(s.sidebar).toBe('false');
    expect(s.density).toBe('compact');
  });
});
