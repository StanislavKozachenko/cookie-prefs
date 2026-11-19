import { readFileSync } from 'node:fs';
import {
  createRequestStore,
  synchronizeMutableCookies,
} from 'next/dist/server/async-storage/request-store';
import { cookies, headers } from 'next/headers.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../index';
import { getTheme } from '../index';

vi.mock('next/headers.js', () => ({ cookies: vi.fn(), headers: vi.fn() }));

/**
 * Mock `headers()` and `cookies()` with the request store the installed Next builds for
 * a request carrying this `Cookie` header and, optionally, cookies set by middleware.
 * `action` runs as a Server Action, then the store enters the render phase as in
 * Next's action handler (same helper as `src/next/__tests__/index.test.tsx`).
 */
const request = async (cookie: string | null, action?: () => Promise<void>, middleware?: string) => {
  const store = createRequestStore({
    phase: action ? 'action' : 'render',
    headers: {
      ...(cookie == null ? {} : { cookie }),
      ...(middleware && { 'x-middleware-set-cookie': middleware }),
    },
    url: { pathname: '/' },
  } as never);
  vi.mocked(headers).mockImplementation(async () => store.headers);
  vi.mocked(cookies).mockImplementation(
    async () => (store.phase == 'action' ? store.userspaceMutableCookies : store.cookies) as never,
  );
  if (action) {
    await action();
    store.phase = 'render';
    synchronizeMutableCookies(store);
  }
};

afterEach(() => {
  vi.mocked(cookies).mockReset();
  vi.mocked(headers).mockReset();
});

it('exports getTheme only', () => {
  expect(Object.keys(entry)).toEqual(['getTheme']);
});

describe('getTheme', () => {
  it('reads the stored theme of the request', async () => {
    await request('a=1; theme=dark');
    await expect(getTheme()).resolves.toBe('dark');
  });

  it('reads the default without a cookie or with an invalid one, and returns system as is', async () => {
    await request(null);
    await expect(getTheme()).resolves.toBe('system');
    await request('theme=blue');
    await expect(getTheme({ defaultTheme: 'dark' })).resolves.toBe('dark');
    await request('theme=%E0%A4%A; theme=dark');
    await expect(getTheme({ defaultTheme: 'light' })).resolves.toBe('light');
    await request('theme=system');
    await expect(getTheme()).resolves.toBe('system');
  });

  it('parses the header like the browser, not like cookies()', async () => {
    // `cookies()` lets the last duplicate win and keeps quotes
    await request('theme=light; theme=dark');
    await expect(getTheme()).resolves.toBe('light');
    await request('theme="dark"');
    await expect(getTheme()).resolves.toBe('dark');
  });

  it('passes the provider options', async () => {
    await request('theme=light; my%20theme=sepia');
    await expect(getTheme({ storageKey: 'my theme', themes: ['sepia', 'dark'] })).resolves.toBe('sepia');
    await request('theme=system');
    await expect(getTheme({ enableSystem: false })).resolves.toBe('light');
    await request('theme=pink');
    await expect(getTheme({ value: { pink: 'p' } })).resolves.toBe('pink');
  });

  it('sees a theme written or deleted earlier in the same request', async () => {
    await request('theme=light', async () => {
      (await cookies()).set('theme', 'dark');
    });
    await expect(getTheme()).resolves.toBe('dark');
    await request('theme=dark', async () => {
      (await cookies()).delete('theme');
    });
    await expect(getTheme({ defaultTheme: 'light' })).resolves.toBe('light');
    await request('theme=light', async () => {
      (await cookies()).set('theme', 'blue');
    });
    await expect(getTheme()).resolves.toBe('system');
  });

  it('sees a theme set by middleware', async () => {
    await request('theme=light', undefined, 'theme=dark; Path=/');
    await expect(getTheme()).resolves.toBe('dark');
  });
});

it('imports the core, cookie-prefs/next and cookie-prefs/theme/server by package name, never next itself', () => {
  const source = readFileSync('src/theme/next/index.ts', 'utf8');
  expect(source.match(/from '[^']*'/g)).toEqual([
    "from 'cookie-prefs'",
    "from 'cookie-prefs/next'",
    "from 'cookie-prefs/theme/server'",
    "from 'cookie-prefs/theme/server'",
  ]);
});
