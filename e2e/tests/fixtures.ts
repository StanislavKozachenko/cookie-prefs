import { test as base, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import path from 'node:path';

export { expect };

export interface Env {
  app: string; // next14 | next15 | next16
  baseURL: string;
  appDir: string;
}

export function env(info: TestInfo): Env {
  const app = `next${process.env.E2E_NEXT ?? '16'}`;
  return {
    app,
    baseURL: String(info.project.use.baseURL),
    appDir: path.resolve(__dirname, '..', '.apps', app),
  };
}

/** Console texts that are always a failure, whatever the level. */
const BAD_TEXT = /hydrat|did not match|Encountered a script tag|Warning:|Minified React error|Text content does not match/i;

export const test = base.extend<{
  /** Console / page errors of every page of the context. Tests may push to `ignore` to tolerate a pattern. */
  watch: { problems: string[]; ignore: RegExp[] };
  env: Env;
}>({
  env: async ({}, use, info) => use(env(info)),
  watch: [
    async ({ context }, use) => {
      const problems: string[] = [];
      const ignore: RegExp[] = [];
      context.on('console', (msg) => {
        const type = msg.type();
        const text = msg.text();
        if (type !== 'error' && type !== 'warning' && !BAD_TEXT.test(text)) return;
        if (msg.location().url.endsWith('/favicon.ico')) return;
        if (ignore.some((re) => re.test(text))) return;
        problems.push(`console.${type}: ${text}`);
      });
      context.on('weberror', (e) => problems.push(`pageerror: ${e.error().message}`));
      await use({ problems, ignore });
      expect(problems, 'console errors / warnings / page errors').toEqual([]);
    },
    { auto: true },
  ],
});

export const DEFAULTS = {
  theme: 'system',
  sidebar: 'true',
  density: 'cozy',
  pageSize: '25',
  locale: '',
  columns: '[]',
};

export const NON_DEFAULT = {
  theme: 'dark',
  sidebar: 'false',
  density: 'compact',
  pageSize: '40',
  locale: 'fr',
  columns: JSON.stringify(['a', 'b']),
};

/** Set pref cookies in the browser context before navigation (values are URI-encoded like cookie-prefs does). */
export async function seed(context: BrowserContext, baseURL: string, values: Record<string, string>, raw = false) {
  await context.addCookies(
    Object.entries(values).map(([name, value]) => ({
      name,
      value: raw ? value : encodeURIComponent(value),
      url: baseURL,
    })),
  );
}

export function cookieHeader(values: Record<string, string>, raw = false): string {
  return Object.entries(values)
    .map(([k, v]) => `${k}=${raw ? v : encodeURIComponent(v)}`)
    .join('; ');
}

/** Text of `<span data-testid="id">` in raw HTML (first match), HTML-entities decoded. */
export function textOf(html: string, id: string): string | null {
  const m = new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`).exec(html);
  if (!m) return null;
  return m[1]!
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export async function hydrated(page: Page) {
  await expect(page.getByTestId('hydrated')).toHaveText('yes');
}

export async function htmlState(page: Page) {
  return page.evaluate(() => {
    const h = document.documentElement;
    return {
      cls: h.className.split(/\s+/).filter(Boolean).sort(),
      sidebar: h.getAttribute('data-sidebar'),
      density: h.getAttribute('data-density'),
    };
  });
}

export async function cookieString(page: Page): Promise<string> {
  return page.evaluate(() => document.cookie);
}

export function hasCookie(cookies: string, name: string, value?: string): boolean {
  const found = cookies.split('; ').find((c) => c.startsWith(name + '='));
  if (!found) return false;
  return value === undefined || found === `${name}=${value}`;
}

/** Abort every Next.js script chunk, so the page can never hydrate: only the server HTML and inline scripts remain. */
export async function blockHydration(page: Page, watch: { ignore: RegExp[] }) {
  watch.ignore.push(/Failed to load resource|net::ERR|NS_ERROR|Load failed|Loading failed for the <script>|due to access control/i);
  await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, (route) => route.abort());
}

/** Records `<html>` state at the first `readystatechange` and at `DOMContentLoaded` (both before any async chunk is guaranteed to have run). */
export async function recordEarly(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __early: Record<string, unknown> };
    w.__early = {};
    const snap = (k: string) => {
      if (w.__early[k]) return;
      const h = document.documentElement;
      w.__early[k] = {
        cls: h.className,
        sidebar: h.getAttribute('data-sidebar'),
        density: h.getAttribute('data-density'),
        hydrated: document.querySelector('[data-testid="hydrated"]')?.textContent ?? null,
      };
    };
    document.addEventListener('readystatechange', () => snap('readystatechange'));
    document.addEventListener('DOMContentLoaded', () => snap('DOMContentLoaded'));
    requestAnimationFrame(() => snap('firstFrame'));
  });
}

export async function early(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __early: Record<string, { cls: string; sidebar: string | null; density: string | null; hydrated: string | null }> }).__early,
  );
}

/** Collects `securitypolicyviolation` events (and `<style>` elements added to the document) from the first byte of every document. */
export async function recordCsp(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[]; __styles: { nonce: string }[] };
    w.__csp = [];
    w.__styles = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push(`${e.effectiveDirective} blocked=${e.blockedURI} sample=${e.sample}`);
    });
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of Array.from(r.addedNodes))
          if (n instanceof HTMLStyleElement) w.__styles.push({ nonce: n.nonce ?? '' });
    }).observe(document, { childList: true, subtree: true });
  });
}

export async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

export async function addedStyles(page: Page): Promise<{ nonce: string }[]> {
  return page.evaluate(() => (window as unknown as { __styles: { nonce: string }[] }).__styles);
}
