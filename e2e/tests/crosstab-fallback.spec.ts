import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, hydrated, htmlState } from './fixtures';

// Cross-tab sync where CookieStore is missing (Safari before 18.4, Firefox before 140). The three Playwright
// browsers all have it, so these tests take it away. The core feature-detects through `globalThis.cookieStore`
// only (src/core/sync.ts): without it every write posts on a `BroadcastChannel('cookie-prefs')` and the hub listens
// on one, and `visibilitychange` to visible re-checks whatever nothing announced. The message can reach the other tab
// before the cookie does (most often in Firefox), so the hub re-checks for a few seconds after it: these tests failed
// in most Firefox runs without that.

type Api = 'cookieStore' | 'BroadcastChannel';

/** Removes the given globals from every page of the context before any app code runs. */
async function remove(context: BrowserContext, apis: Api[]) {
  await context.addInitScript((names) => {
    // `cookieStore` is an own accessor of `window` in some engines and on `Window.prototype` in others: walk the chain.
    for (const name of names)
      for (let o: object | null = window; o; o = Object.getPrototypeOf(o)) Reflect.deleteProperty(o, name);
  }, apis);
}

/** Two pages of one context on `url`, hydrated, with the removed APIs really gone and B marked to detect a reload. */
async function open(context: BrowserContext, url: string, apis: Api[]) {
  const a = await context.newPage();
  const b = await context.newPage();
  for (const p of [a, b]) {
    await p.goto(url);
    await hydrated(p);
    expect(await p.evaluate((names) => names.filter((n) => n in window), apis), 'APIs left on window').toEqual([]);
  }
  await b.evaluate(() => ((window as unknown as { __alive: boolean }).__alive = true));
  return { a, b };
}

/** Counts messages on the library's channel in `page`, so a test can see the other tab posted. */
async function countMessages(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __messages: number; __channel: BroadcastChannel };
    w.__messages = 0;
    w.__channel = new BroadcastChannel('cookie-prefs');
    w.__channel.onmessage = () => w.__messages++;
  });
  return () => page.evaluate(() => (window as unknown as { __messages: number }).__messages);
}

const alive = (page: Page) => page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive);

const cls = (page: Page) => page.evaluate(() => document.documentElement.className.split(/\s+/).filter(Boolean).sort());

/** Fires `visibilitychange` in a page that is already visible: what the tab being shown again does. */
async function shown(page: Page) {
  expect(await page.evaluate(() => document.visibilityState)).toBe('visible');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

/** How long a tab that is not reached must stay unchanged: well past a BroadcastChannel round trip. */
const QUIET_MS = 1000;

test.describe('crosstab without CookieStore: BroadcastChannel fallback', () => {
  for (const mode of ['script', 'server'] as const) {
    test(`${mode} mode: a change in one tab shows up in the other without reload`, async ({ context }) => {
      await remove(context, ['cookieStore']);
      const { a, b } = await open(context, `/${mode}`, ['cookieStore']);
      const messages = await countMessages(b);

      await a.getByTestId('toggle-sidebar').click();
      await expect(b.getByTestId('sidebar')).toHaveText('false');
      await expect.poll(async () => (await htmlState(b)).sidebar).toBe('false');
      expect(await messages(), 'tab A posted on the channel').toBeGreaterThan(0);

      await a.getByTestId('set-theme-dark').click();
      await expect(b.getByTestId('theme')).toHaveText('dark');
      await expect(b.locator('html')).toHaveClass(/\bdark\b/);

      await b.getByTestId('set-density-compact').click();
      await expect(a.getByTestId('density')).toHaveText('compact');
      await expect.poll(async () => (await htmlState(a)).density).toBe('compact');

      await a.getByTestId('reset-theme').click();
      await expect(b.getByTestId('theme')).toHaveText('system');
      await expect.poll(async () => (await htmlState(b)).cls).toEqual(['system']);
      expect(await alive(b), 'tab B was not reloaded').toBe(true);
    });
  }

  test.describe('theme preset', () => {
    test.use({ colorScheme: 'light' });

    test('setTheme in one tab reaches the other without reload', async ({ context }) => {
      await remove(context, ['cookieStore']);
      const { a, b } = await open(context, '/theme', ['cookieStore']);
      const messages = await countMessages(b);

      await a.getByTestId('set-dark').click();
      await expect(b.getByTestId('theme')).toHaveText('dark');
      await expect(b.getByTestId('resolved')).toHaveText('dark');
      await expect.poll(() => cls(b)).toEqual(['dark']);
      expect(await messages(), 'tab A posted on the channel').toBeGreaterThan(0);

      await b.getByTestId('set-light').click();
      await expect(a.getByTestId('theme')).toHaveText('light');
      await expect.poll(() => cls(a)).toEqual(['light']);
      expect(await alive(b), 'tab B was not reloaded').toBe(true);
    });
  });
});

// Control: the same pages with BroadcastChannel removed too. The other tab must not follow live, so the tests above
// cannot pass through anything but the channel; it follows once it is shown again (`visibilitychange`), as
// docs/design.md promises for changes nothing announced.
test.describe('crosstab without CookieStore and BroadcastChannel (control)', () => {
  const both: Api[] = ['cookieStore', 'BroadcastChannel'];

  test('script mode: the other tab stays stale until it is shown again', async ({ context }) => {
    await remove(context, both);
    const { a, b } = await open(context, '/script', both);

    await a.getByTestId('toggle-sidebar').click();
    await expect(a.getByTestId('sidebar')).toHaveText('false');
    await b.waitForTimeout(QUIET_MS);
    await expect(b.getByTestId('sidebar')).toHaveText('true');
    expect((await htmlState(b)).sidebar).toBe('true');

    await shown(b);
    await expect(b.getByTestId('sidebar')).toHaveText('false');
    await expect.poll(async () => (await htmlState(b)).sidebar).toBe('false');
    expect(await alive(b), 'tab B was not reloaded').toBe(true);
  });

  test.describe('theme preset', () => {
    test.use({ colorScheme: 'light' });

    test('the other tab stays stale until it is shown again', async ({ context }) => {
      await remove(context, both);
      const { a, b } = await open(context, '/theme', both);

      await a.getByTestId('set-dark').click();
      await expect(a.getByTestId('theme')).toHaveText('dark');
      await b.waitForTimeout(QUIET_MS);
      await expect(b.getByTestId('theme')).toHaveText('system');
      expect(await cls(b)).toEqual(['light']);

      await shown(b);
      await expect(b.getByTestId('theme')).toHaveText('dark');
      await expect.poll(() => cls(b)).toEqual(['dark']);
      expect(await alive(b), 'tab B was not reloaded').toBe(true);
    });
  });
});
