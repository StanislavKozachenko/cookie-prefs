import { test, expect, env, seed, cookieHeader, textOf, hydrated, htmlState, DEFAULTS } from './fixtures';

const TAMPERED: Record<string, string> = {
  theme: 'purple',
  sidebar: 'maybe',
  density: '%E0%A4%A', // malformed percent-encoding
  pageSize: 'abc',
  columns: '%7Bbad', // "{bad": not JSON
};
const WRONG_SHAPE: Record<string, string> = {
  theme: 'DARK', // wrong case
  sidebar: '1',
  density: 'compact%00',
  pageSize: 'Infinity',
  columns: encodeURIComponent('{"a":1}'), // valid JSON, fails the zod schema
};

for (const [label, jar] of [['garbage', TAMPERED], ['wrong shape', WRONG_SHAPE]] as const) {
  for (const mode of ['server'] as const) {
    test.describe(`tampered: ${label} cookies fall back to defaults (${mode} mode)`, () => {
      test('browser: defaults in text and on <html>, no errors', async ({ page, context }, info) => {
        await seed(context, env(info).baseURL, jar, true);
        await page.goto(`/${mode}`);
        await hydrated(page);
        for (const k of ['theme', 'sidebar', 'density', 'pageSize', 'columns'] as const) {
          await expect(page.getByTestId(k), k).toHaveText(DEFAULTS[k]);
        }
        const s = await htmlState(page);
        expect(s.cls).toEqual(['system']);
        expect(s.sidebar).toBe('true');
        expect(s.density).toBe('cozy');
      });
    });
  }

  test(`tampered: ${label}: server mode first HTML has defaults and status 200`, async ({ request }) => {
    const res = await request.get('/server', { headers: { cookie: cookieHeader(jar, true) } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    for (const k of ['theme', 'sidebar', 'density', 'pageSize', 'columns'] as const) {
      expect(textOf(html, `rsc-${k}`), `rsc-${k}`).toBe(DEFAULTS[k]);
      expect(textOf(html, k), k).toBe(DEFAULTS[k]);
    }
  });

  test(`tampered: ${label}: theme preset ignores a bad theme cookie`, async ({ page, context }, info) => {
    await seed(context, env(info).baseURL, { theme: jar.theme! }, true);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/theme');
    await hydrated(page);
    await expect(page.getByTestId('theme')).toHaveText('system');
    await expect(page.getByTestId('resolved')).toHaveText('light');
    expect(await page.evaluate(() => document.documentElement.className)).toBe('light');
  });
}
