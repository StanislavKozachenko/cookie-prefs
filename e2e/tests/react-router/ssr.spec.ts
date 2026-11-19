import { seed, cookieHeader, textOf, hydrated, htmlState } from '../fixtures';
import { test, expect, IDS, DEFAULTS, NON_DEFAULT } from './helpers';

// The root loader passes `snapshotPrefs(prefs, cookie)` to <PrefsProvider snapshot>, the page loader reads `readPrefs`.
test.describe('react router ssr: the first HTML holds the request cookie values', () => {
  test('raw response: loader values and usePref values', async ({ request }) => {
    const res = await request.get('/', { headers: { cookie: cookieHeader(NON_DEFAULT) } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    for (const id of IDS) {
      expect(textOf(html, `loader-${id}`), `loader-${id} (readPrefs)`).toBe(NON_DEFAULT[id]);
      expect(textOf(html, id), `${id} (usePref in first HTML)`).toBe(NON_DEFAULT[id]);
    }
    expect(textOf(html, 'hydrated')).toBe('no');
  });

  test('no cookies: defaults in the first HTML', async ({ request }) => {
    const html = await (await request.get('/', { headers: { cookie: '' } })).text();
    for (const id of IDS) {
      expect(textOf(html, `loader-${id}`), `loader-${id}`).toBe(DEFAULTS[id]);
      expect(textOf(html, id), id).toBe(DEFAULTS[id]);
    }
  });

  test.describe('JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });
    test('the browser shows the cookie values without hydrating', async ({ page, context, baseURL }) => {
      await seed(context, baseURL!, NON_DEFAULT);
      await page.goto('/');
      for (const id of IDS) {
        await expect(page.getByTestId(id)).toHaveText(NON_DEFAULT[id]);
        await expect(page.getByTestId(`loader-${id}`)).toHaveText(NON_DEFAULT[id]);
      }
      await expect(page.getByTestId('hydrated')).toHaveText('no');
    });
  });

  test('values stay equal after hydration, without hydration warnings', async ({ page, context, baseURL }) => {
    await seed(context, baseURL!, NON_DEFAULT);
    await page.goto('/');
    await hydrated(page);
    for (const id of IDS) await expect(page.getByTestId(id)).toHaveText(NON_DEFAULT[id]);
    const s = await htmlState(page);
    expect(s.cls).toEqual(['dark']);
    expect(s.sidebar).toBe('false');
    expect(s.density).toBe('compact');
    // the auto `watch` fixture fails the test on any console error / warning / page error
  });
});

const TAMPERED: Record<string, string> = {
  theme: 'purple',
  sidebar: 'maybe',
  density: '%E0%A4%A', // malformed percent-encoding
  pageSize: 'abc',
};
const WRONG_SHAPE: Record<string, string> = {
  theme: 'DARK', // wrong case
  sidebar: '1',
  density: 'compact%00',
  pageSize: 'Infinity',
};

for (const [label, jar] of [['garbage', TAMPERED], ['wrong shape', WRONG_SHAPE]] as const) {
  test.describe(`react router tampered: ${label} cookies fall back to defaults`, () => {
    test('first HTML has defaults and status 200', async ({ request }) => {
      const res = await request.get('/', { headers: { cookie: cookieHeader(jar, true) } });
      expect(res.status()).toBe(200);
      const html = await res.text();
      for (const id of IDS) {
        expect(textOf(html, `loader-${id}`), `loader-${id}`).toBe(DEFAULTS[id]);
        expect(textOf(html, id), id).toBe(DEFAULTS[id]);
      }
    });

    test('browser: defaults in text and on <html>, no errors', async ({ page, context, baseURL }) => {
      await seed(context, baseURL!, jar, true);
      await page.goto('/');
      await hydrated(page);
      for (const id of IDS) await expect(page.getByTestId(id), id).toHaveText(DEFAULTS[id]);
      const s = await htmlState(page);
      expect(s.cls).toEqual(['system']);
      expect(s.sidebar).toBe('true');
      expect(s.density).toBe('cozy');
    });
  });
}
