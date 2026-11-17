import {
  test, expect, env, seed, hydrated, htmlState, blockHydration, recordEarly, early, NON_DEFAULT,
} from './fixtures';
import fs from 'node:fs';
import path from 'node:path';

for (const mode of ['script', 'server'] as const) {
  test.describe(`script: <html> reflection before hydration (${mode} mode)`, () => {
    const url = `/${mode}`;

    test('raw HTML has the blocking inline script before the content', async ({ request }) => {
      const html = await (await request.get(url)).text();
      const m = /<script[^>]*>\(function\(P\)\{[^<]*\}\)\("([^<]*)"\)<\/script>/.exec(html);
      expect(m, 'inline prefs script in first HTML').not.toBeNull();
      expect(m![0]).toContain('data-sidebar');
      expect(m![0]).toContain('data-density');
      expect(html).toMatch(/<script type="text\/javascript">\(function\(P\)/);
      const scriptAt = html.indexOf('(function(P)');
      expect(scriptAt, 'script precedes page content').toBeLessThan(html.indexOf('data-testid="hydrated"'));
    });

    test('attributes are on <html> at readystatechange / DOMContentLoaded / first frame', async ({ page, context }, info) => {
      await seed(context, env(info).baseURL, NON_DEFAULT);
      await recordEarly(page);
      await page.goto(url);
      await hydrated(page);
      const e = await early(page);
      for (const k of ['readystatechange', 'DOMContentLoaded'] as const) {
        expect(e[k], `snapshot ${k} exists`).toBeTruthy();
        expect(e[k]!.cls.split(/\s+/), `${k}: class`).toContain('dark');
        expect(e[k]!.sidebar, `${k}: data-sidebar`).toBe('false');
        expect(e[k]!.density, `${k}: data-density`).toBe('compact');
      }
      if (e.firstFrame) {
        expect(e.firstFrame.cls.split(/\s+/)).toContain('dark');
        expect(e.firstFrame.sidebar).toBe('false');
      }
    });

    test('attributes are set even if the page never hydrates (all Next chunks blocked)', async ({ page, context, watch }, info) => {
      await seed(context, env(info).baseURL, NON_DEFAULT);
      await blockHydration(page, watch);
      await page.goto(url);
      await expect(page.getByTestId('hydrated')).toHaveText('no');
      const s = await htmlState(page);
      expect(s.cls).toContain('dark');
      expect(s.cls).not.toContain('system');
      expect(s.sidebar).toBe('false');
      expect(s.density).toBe('compact');
    });

  });
}

test.describe('static: script mode keeps the route prerendered', () => {
  test('build output marks /script and /theme static, getPrefs routes dynamic', async ({ env }) => {
    const out = path.join(env.appDir, '.next', 'server', 'app');
    expect(fs.existsSync(path.join(out, 'script.html')), '/script prerendered (script.html)').toBe(true);
    expect(fs.existsSync(path.join(out, 'theme.html')), '/theme prerendered').toBe(true);
    expect(fs.existsSync(path.join(out, 'server.html')), '/server NOT prerendered').toBe(false);
    expect(fs.existsSync(path.join(out, 'script', 'rsc.html')), '/script/rsc NOT prerendered').toBe(false);
  });

  test('static HTML ignores request cookies', async ({ request }) => {
    const a = await (await request.get('/script', { headers: { cookie: 'theme=dark; sidebar=false' } })).text();
    const b = await (await request.get('/script', { headers: { cookie: '' } })).text();
    expect(a).toBe(b);
  });
});
