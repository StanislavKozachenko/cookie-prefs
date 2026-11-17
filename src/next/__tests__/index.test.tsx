import { readFileSync } from 'node:fs';
import {
  createRequestStore,
  synchronizeMutableCookies,
} from 'next/dist/server/async-storage/request-store';
import { cookies, headers } from 'next/headers.js';
// The store class behind `cookies()`: next/dist/server/async-storage/request-store.js
// builds it from the same request headers.
import { RequestCookies } from 'next/dist/server/web/spec-extension/cookies';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { definePrefs, pref, prefsScript, type PrefsSnapshot } from '../../index';
import { PrefsProvider as ClientPrefsProvider, usePref } from '../../react/index';
import * as entry from '../index';
import { getPrefs, PrefsProvider } from '../index';

vi.mock('next/headers.js', () => ({ cookies: vi.fn(), headers: vi.fn() }));

/**
 * Mock `headers()` and `cookies()` with the request store the installed Next builds
 * for a request carrying this `Cookie` header (`null`: none) and, optionally, cookies
 * set by middleware. `action` runs as a Server Action, where `cookies()` is mutable;
 * then the store enters the render phase as in Next's action handler, so the render
 * sees the action's writes in `cookies()` but not in `headers()`.
 */
const request = async (
  cookie: string | null,
  action?: () => Promise<void>,
  middleware?: string,
) => {
  const store = createRequestStore({
    phase: action ? 'action' : 'render',
    headers: {
      ...(cookie == null ? {} : { cookie }),
      ...(middleware && { 'x-middleware-set-cookie': middleware }),
    },
    url: { pathname: '/' },
  } as never);
  vi.mocked(headers).mockImplementation(async () => store.headers);
  // like next/dist/server/request/cookies.js, which types both as read-only
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
  vi.unstubAllGlobals();
});

const make = () =>
  definePrefs({
    theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class'),
    sidebar: pref.boolean().default(true),
    locale: pref.string(),
  });

const Show = ({ prefs }: { prefs: ReturnType<typeof make> }) => {
  const [theme] = usePref(prefs.theme);
  const [sidebar] = usePref(prefs.sidebar);
  return <p>{`${theme} ${sidebar}`}</p>;
};

/** Render like the server: no `document`. */
const ssr = (node: Parameters<typeof renderToString>[0]) => {
  vi.stubGlobal('document', undefined);
  try {
    return renderToString(node);
  } finally {
    vi.unstubAllGlobals();
  }
};

/** Snapshot that `PrefsProvider` passes to the client in server mode. */
const serverSnapshot = async (prefs: ReturnType<typeof make>) => {
  const element = await PrefsProvider({ prefs, mode: 'server' });
  return (element.props as { snapshot: PrefsSnapshot }).snapshot;
};

it('exports the next api', () => {
  expect(Object.keys(entry).sort()).toEqual(['PrefsProvider', 'getPrefs']);
});

describe('getPrefs', () => {
  it('reads typed values from the Cookie header', async () => {
    const prefs = make();
    await request('theme=dark; locale=de%20AT; session=secret');
    const values = await getPrefs(prefs);
    expectTypeOf(values.theme).toEqualTypeOf<'light' | 'dark' | 'system'>();
    expectTypeOf(values.locale).toEqualTypeOf<string | undefined>();
    expect(values).toEqual({ theme: 'dark', sidebar: true, locale: 'de AT' });
    expect(headers).toHaveBeenCalledTimes(1);
    expect(cookies).toHaveBeenCalledTimes(1);
  });

  it('reads defaults when cookies are missing or invalid', async () => {
    await request('theme=blue; sidebar=nope; locale=%E0%A4%A');
    expect(await getPrefs(make())).toEqual({ theme: 'system', sidebar: true, locale: undefined });
    await request(null);
    expect(await getPrefs(make())).toEqual({ theme: 'system', sidebar: true, locale: undefined });
  });

  it('takes the first of duplicate cookies, like the browser', async () => {
    // `density=cozy` at `/` and `density=compact` at `/sm`: on `/sm` the browser sends
    // the longer path first, and `document.cookie` and the inline script read it.
    await request('theme=light; sidebar=false; theme=dark; sidebar=true');
    expect(await getPrefs(make())).toMatchObject({ theme: 'light', sidebar: false });
  });

  it('strips quotes around a value, like the browser', async () => {
    await request('theme="dark"; locale="de%20AT"');
    expect(await getPrefs(make())).toMatchObject({ theme: 'dark', locale: 'de AT' });
  });

  it('reads a pref written earlier in the same request', async () => {
    const prefs = make();
    await request('theme=light; locale=de', async () => {
      // a Server Action, followed by `revalidatePath()`
      (await cookies()).set(prefs.theme.toCookie('dark'));
      (await cookies()).set(prefs.locale.toCookie('"de AT"'));
    });
    expect(await getPrefs(prefs)).toEqual({ theme: 'dark', sidebar: true, locale: '"de AT"' });
  });

  it('reads a pref deleted earlier in the same request as missing', async () => {
    const prefs = make();
    await request('theme=dark; sidebar=false; locale=de', async () => {
      (await cookies()).delete(prefs.theme.name);
      (await cookies()).delete(prefs.locale.name);
    });
    expect(await getPrefs(prefs)).toEqual({ theme: 'system', sidebar: false, locale: undefined });
  });

  it('reads writes inside the Server Action itself', async () => {
    const prefs = make();
    await request('theme=light; sidebar=false', async () => {
      (await cookies()).set(prefs.theme.toCookie('dark'));
      (await cookies()).delete(prefs.sidebar.name);
      expect(await getPrefs(prefs)).toEqual({ theme: 'dark', sidebar: true, locale: undefined });
    });
  });

  it('reads a cookie set by middleware', async () => {
    await request('theme=light', undefined, 'theme=dark; Path=/');
    expect(await getPrefs(make())).toMatchObject({ theme: 'dark' });
  });

  it('follows the header for cookies not written in this request', async () => {
    const prefs = make();
    // `cookies()` shows the last `theme` and keeps quotes: values the header holds
    // too, so not writes; only `sidebar` is written
    await request('theme=light; theme=dark; locale="de%20AT"', async () => {
      (await cookies()).set(prefs.sidebar.toCookie(false));
    });
    expect(await getPrefs(prefs)).toEqual({ theme: 'light', sidebar: false, locale: 'de AT' });
    // `cookies()` skips the malformed `theme` and reads a bare `locale` as `'true'`
    await request('theme=%E0%A4%A; theme=dark; locale');
    expect(await getPrefs(prefs)).toEqual({ theme: 'system', sidebar: true, locale: undefined });
  });
});

describe('PrefsProvider', () => {
  it('defaults to script mode and never touches request APIs', async () => {
    const prefs = make();
    const element = await PrefsProvider({ prefs, nonce: 'abc', children: 'x' });
    expect(element.type).toBe(ClientPrefsProvider);
    expect(element.props).toEqual({
      snapshot: undefined,
      script: prefsScript(prefs),
      nonce: 'abc',
      children: 'x',
    });
    await PrefsProvider({ prefs, mode: 'script' });
    expect(headers).not.toHaveBeenCalled();
    expect(cookies).not.toHaveBeenCalled();
  });

  it('passes only the prefs’ own cookies in server mode', async () => {
    const prefs = make();
    await request('theme=dark; sidebar=false; session=secret');
    const element = await PrefsProvider({ prefs, mode: 'server', children: 'x' });
    expect(headers).toHaveBeenCalledTimes(1);
    expect(cookies).toHaveBeenCalledTimes(1);
    const props = element.props as { snapshot: PrefsSnapshot; script: string };
    expect(props.snapshot).toEqual({ theme: 'dark', sidebar: 'false' });
    expect(props.script).toBe(prefsScript(prefs));
  });

  it('snapshots duplicates, quotes and encoding like the browser', async () => {
    await request('theme="dark"; locale=de%20AT; theme=light; sidebar=%E0%A4%A');
    expect(await serverSnapshot(make())).toEqual({ theme: 'dark', locale: 'de AT' });
  });

  it('snapshots writes and deletes made earlier in the same request', async () => {
    const prefs = make();
    await request('theme=light; sidebar=false; locale="de"; locale=fr', async () => {
      (await cookies()).set(prefs.theme.toCookie('dark'));
      (await cookies()).delete(prefs.sidebar.name);
    });
    expect(await serverSnapshot(prefs)).toEqual({ theme: 'dark', locale: 'de' });
  });

  it('never passes the pref handles to the client component', async () => {
    await request(null);
    const element = await PrefsProvider({ prefs: make(), mode: 'server' });
    expect(element.props).not.toHaveProperty('prefs');
    expect(JSON.parse(JSON.stringify(element.props))).toEqual(element.props);
  });

  it('server-renders exact values and the script in server mode', async () => {
    const prefs = make();
    await request('theme=dark; sidebar=false');
    const markup = ssr(
      await PrefsProvider({ prefs, mode: 'server', nonce: 'abc', children: <Show prefs={prefs} /> }),
    );
    expect(markup).toContain('<p>dark false</p>');
    expect(markup).toContain('nonce="abc"');
    expect(markup).toContain(prefsScript(prefs));
  });

  it('server-renders defaults in script mode', async () => {
    const prefs = make();
    const markup = ssr(await PrefsProvider({ prefs, children: <Show prefs={prefs} /> }));
    expect(markup).toContain('<p>system true</p>');
    expect(markup).toContain(prefsScript(prefs));
  });
});

// Why both: Next's cookie store parses the same header with other rules than the
// browser, so SSR could disagree with `<html>`, but only it shows same-request writes.
describe('the cookies() store of the installed next', () => {
  const header = 'theme=light; locale="de"; theme=dark';
  const store = new RequestCookies(new Headers({ cookie: header }));

  it('lets the last duplicate win and keeps quotes', () => {
    expect(store.get('theme')?.value).toBe('dark');
    expect(store.get('locale')?.value).toBe('"de"');
  });

  it('shows same-request writes in cookies() only, a delete as an empty value', async () => {
    await request('theme=light; locale=de', async () => {
      (await cookies()).set('theme', 'dark');
      (await cookies()).delete('locale');
    });
    expect((await headers()).get('cookie')).toBe('theme=light; locale=de');
    expect((await cookies()).get('theme')?.value).toBe('dark');
    expect((await cookies()).get('locale')?.value).toBe('');
  });

  it('disagrees with what prefkit reads from the header', async () => {
    const prefs = make();
    await request(header);
    expect(await getPrefs(prefs)).toMatchObject({ theme: 'light', locale: 'de' });
    expect(prefs.theme.read(store)).toBe('dark');
    expect(prefs.locale.read(store)).toBe('"de"');
  });
});

describe('imports', () => {
  // next has no `exports` map, so plain Node ESM (and vitest in a consumer project,
  // where prefkit is not bundled) only resolves its subpaths with the file extension.
  it('imports next/headers.js, with the extension', () => {
    const source = readFileSync('src/next/index.tsx', 'utf8');
    expect(source.match(/from '(next\/[^']*)'/g)).toEqual(["from 'next/headers.js'"]);
  });
});
