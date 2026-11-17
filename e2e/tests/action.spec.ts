import { test, expect, hydrated, cookieString, hasCookie } from './fixtures';

for (const mode of ['server', 'script'] as const) {
  test.describe(`action: Server Action cookie write (${mode} layout)`, () => {
    const url = `/${mode}/action`;

    test.beforeEach(async ({ page }) => {
      // record the text of every Server Action response (requests carrying a `next-action` header)
      await page.addInitScript(() => {
        const w = window as unknown as { __actionBodies: string[] };
        w.__actionBodies = [];
        const orig = window.fetch;
        window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
          const res = await orig.call(this, input, init);
          const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
          if (h.has('next-action')) res.clone().text().then((t) => w.__actionBodies.push(t));
          return res;
        };
      });
    });

    test('getPrefs in the same action response sees the cookie written by the action', async ({ page, context, env }) => {
      await page.goto(url);
      await hydrated(page);
      await expect(page.getByTestId('rsc-locale')).toHaveText('');
      await page.evaluate(() => ((window as unknown as { __alive: boolean }).__alive = true));

      const responsePromise = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith(url) && 'next-action' in r.request().headers(),
      );
      await page.getByTestId('action-set-locale').click();
      const res = await responsePromise;
      expect(res.status()).toBe(200);
      // the body is read inside the page: the CDP body of a streamed fetch response is not always available
      await expect.poll(() => page.evaluate(() => (window as unknown as { __actionBodies: string[] }).__actionBodies.length)).toBeGreaterThan(0);
      const body = (await page.evaluate(() => (window as unknown as { __actionBodies: string[] }).__actionBodies))[0]!;
      // the action response carries the re-rendered tree (revalidatePath): the RSC payload of the span
      expect(body, 'RSC payload of the action response').toMatch(/rsc-locale[^}]*"children":"de"/);
      expect((await res.allHeaders())['set-cookie'] ?? '').toMatch(/locale=de/);

      await expect(page.getByTestId('rsc-locale')).toHaveText('de');
      expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive), 'no full reload').toBe(true);
      expect((await context.cookies(env.baseURL)).find((c) => c.name === 'locale')?.value).toBe('de');
    });

  });
}
