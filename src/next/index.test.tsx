import { cookies, headers } from 'next/headers';
// The store class behind `cookies()`: next/dist/server/async-storage/request-store.js
// builds it from the same request headers.
import { RequestCookies } from 'next/dist/server/web/spec-extension/cookies';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { definePrefs, pref, prefsScript, type PrefsSnapshot } from '../index';
import { PrefsProvider as ClientPrefsProvider, usePref } from '../react/index';
import * as entry from './index';
import { getPrefs, PrefsProvider } from './index';

vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));

/** Mock `headers()` with a request carrying this `Cookie` header (`null`: none). */
const requestCookies = (cookie: string | null) => {
  vi.mocked(headers).mockResolvedValue(new Headers(cookie == null ? {} : { cookie }) as never);
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
    requestCookies('theme=dark; locale=de%20AT; session=secret');
    const values = await getPrefs(prefs);
    expectTypeOf(values.theme).toEqualTypeOf<'light' | 'dark' | 'system'>();
    expectTypeOf(values.locale).toEqualTypeOf<string | undefined>();
    expect(values).toEqual({ theme: 'dark', sidebar: true, locale: 'de AT' });
    expect(headers).toHaveBeenCalledTimes(1);
    expect(cookies).not.toHaveBeenCalled();
  });

  it('reads defaults when cookies are missing or invalid', async () => {
    requestCookies('theme=blue; sidebar=nope; locale=%E0%A4%A');
    expect(await getPrefs(make())).toEqual({ theme: 'system', sidebar: true, locale: undefined });
    requestCookies(null);
    expect(await getPrefs(make())).toEqual({ theme: 'system', sidebar: true, locale: undefined });
  });

  it('takes the first of duplicate cookies, like the browser', async () => {
    // `density=cozy` at `/` and `density=compact` at `/sm`: on `/sm` the browser sends
    // the longer path first, and `document.cookie` and the inline script read it.
    requestCookies('theme=light; sidebar=false; theme=dark; sidebar=true');
    expect(await getPrefs(make())).toMatchObject({ theme: 'light', sidebar: false });
  });

  it('strips quotes around a value, like the browser', async () => {
    requestCookies('theme="dark"; locale="de%20AT"');
    expect(await getPrefs(make())).toMatchObject({ theme: 'dark', locale: 'de AT' });
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
    requestCookies('theme=dark; sidebar=false; session=secret');
    const element = await PrefsProvider({ prefs, mode: 'server', children: 'x' });
    expect(headers).toHaveBeenCalledTimes(1);
    expect(cookies).not.toHaveBeenCalled();
    const props = element.props as { snapshot: PrefsSnapshot; script: string };
    expect(props.snapshot).toEqual({ theme: 'dark', sidebar: 'false' });
    expect(props.script).toBe(prefsScript(prefs));
  });

  it('snapshots duplicates, quotes and encoding like the browser', async () => {
    requestCookies('theme="dark"; locale=de%20AT; theme=light; sidebar=%E0%A4%A');
    expect(await serverSnapshot(make())).toEqual({ theme: 'dark', locale: 'de AT' });
  });

  it('never passes the pref handles to the client component', async () => {
    requestCookies(null);
    const element = await PrefsProvider({ prefs: make(), mode: 'server' });
    expect(element.props).not.toHaveProperty('prefs');
    expect(JSON.parse(JSON.stringify(element.props))).toEqual(element.props);
  });

  it('server-renders exact values and the script in server mode', async () => {
    const prefs = make();
    requestCookies('theme=dark; sidebar=false');
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

// Why the raw header and not `cookies()`: Next's cookie store parses the same header
// with other rules than the browser, so SSR could disagree with `<html>`.
describe('the cookies() store of the installed next', () => {
  const header = 'theme=light; locale="de"; theme=dark';
  const store = new RequestCookies(new Headers({ cookie: header }));

  it('lets the last duplicate win and keeps quotes', () => {
    expect(store.get('theme')?.value).toBe('dark');
    expect(store.get('locale')?.value).toBe('"de"');
  });

  it('disagrees with what prefkit reads from the header', async () => {
    const prefs = make();
    requestCookies(header);
    expect(await getPrefs(prefs)).toMatchObject({ theme: 'light', locale: 'de' });
    expect(prefs.theme.read(store)).toBe('dark');
    expect(prefs.locale.read(store)).toBe('"de"');
  });
});
