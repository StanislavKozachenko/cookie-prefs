import { test, expect, env, seed, cookieHeader, textOf, hydrated, NON_DEFAULT, DEFAULTS } from './fixtures';

const ids = Object.keys(NON_DEFAULT) as (keyof typeof NON_DEFAULT)[];

test.describe('ssr: server mode renders cookie values in the first HTML', () => {
  test('raw response of /server (Server Component and client hooks)', async ({ request }) => {
    const res = await request.get('/server', { headers: { cookie: cookieHeader(NON_DEFAULT) } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    for (const id of ids) {
      expect(textOf(html, `rsc-${id}`), `rsc-${id} (getPrefs)`).toBe(NON_DEFAULT[id]);
      expect(textOf(html, id), `${id} (usePref in first HTML)`).toBe(NON_DEFAULT[id]);
    }
    expect(textOf(html, 'hydrated')).toBe('no');
  });

  test('no cookies: defaults in the first HTML', async ({ request }) => {
    const html = await (await request.get('/server', { headers: { cookie: '' } })).text();
    for (const id of ids) {
      expect(textOf(html, `rsc-${id}`), `rsc-${id}`).toBe(DEFAULTS[id]);
      expect(textOf(html, id), id).toBe(DEFAULTS[id]);
    }
  });

  test.describe('JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });
    test('browser shows the cookie values without any hydration', async ({ page, context }, info) => {
      await seed(context, env(info).baseURL, NON_DEFAULT);
      await page.goto('/server');
      for (const id of ids) {
        await expect(page.getByTestId(id)).toHaveText(NON_DEFAULT[id]);
        await expect(page.getByTestId(`rsc-${id}`)).toHaveText(NON_DEFAULT[id]);
      }
      await expect(page.getByTestId('hydrated')).toHaveText('no');
    });
  });

  test('with JS: values stay equal after hydration', async ({ page, context }, info) => {
    await seed(context, env(info).baseURL, NON_DEFAULT);
    await page.goto('/server');
    await hydrated(page);
    for (const id of ids) await expect(page.getByTestId(id)).toHaveText(NON_DEFAULT[id]);
  });

  test('script-mode layout + getPrefs page (/script/rsc): RSC exact, hooks default in HTML', async ({ request }) => {
    const html = await (await request.get('/script/rsc', { headers: { cookie: cookieHeader(NON_DEFAULT) } })).text();
    for (const id of ids) {
      expect(textOf(html, `rsc-${id}`), `rsc-${id}`).toBe(NON_DEFAULT[id]);
      expect(textOf(html, id), `${id} hook in script mode, first HTML`).toBe(DEFAULTS[id]);
    }
  });

  test('script-mode hooks render defaults in HTML, cookie values after hydration', async ({ page, context, request }, info) => {
    const html = await (await request.get('/script', { headers: { cookie: cookieHeader(NON_DEFAULT) } })).text();
    for (const id of ids) expect(textOf(html, id), id).toBe(DEFAULTS[id]);
    await seed(context, env(info).baseURL, NON_DEFAULT);
    await page.goto('/script');
    await hydrated(page);
    for (const id of ids) await expect(page.getByTestId(id)).toHaveText(NON_DEFAULT[id]);
  });
});
