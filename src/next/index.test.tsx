import { cookies } from 'next/headers';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { definePrefs, pref, prefsScript, type PrefsSnapshot } from '../index';
import { PrefsProvider as ClientPrefsProvider, usePref } from '../react/index';
import * as entry from './index';
import { getPrefs, PrefsProvider } from './index';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

/** Mock `cookies()` with a request cookie store holding these (decoded) values. */
const requestCookies = (values: Record<string, string>) => {
  const store = {
    get: (name: string) => (name in values ? { name, value: values[name]! } : undefined),
  };
  vi.mocked(cookies).mockResolvedValue(store as never);
};

afterEach(() => {
  vi.mocked(cookies).mockReset();
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

it('exports the next api', () => {
  expect(Object.keys(entry).sort()).toEqual(['PrefsProvider', 'getPrefs']);
});

describe('getPrefs', () => {
  it('reads typed values from cookies()', async () => {
    const prefs = make();
    requestCookies({ theme: 'dark', locale: 'de AT', session: 'secret' });
    const values = await getPrefs(prefs);
    expectTypeOf(values.theme).toEqualTypeOf<'light' | 'dark' | 'system'>();
    expectTypeOf(values.locale).toEqualTypeOf<string | undefined>();
    expect(values).toEqual({ theme: 'dark', sidebar: true, locale: 'de AT' });
    expect(cookies).toHaveBeenCalledTimes(1);
  });

  it('reads defaults when cookies are missing or invalid', async () => {
    requestCookies({ theme: 'blue', sidebar: 'nope' });
    expect(await getPrefs(make())).toEqual({ theme: 'system', sidebar: true, locale: undefined });
  });
});

describe('PrefsProvider', () => {
  it('defaults to script mode and never calls cookies()', async () => {
    const prefs = make();
    const element = await PrefsProvider({ prefs, nonce: 'abc', children: 'x' });
    expect(cookies).not.toHaveBeenCalled();
    expect(element.type).toBe(ClientPrefsProvider);
    expect(element.props).toEqual({
      snapshot: undefined,
      script: prefsScript(prefs),
      nonce: 'abc',
      children: 'x',
    });
    await PrefsProvider({ prefs, mode: 'script' });
    expect(cookies).not.toHaveBeenCalled();
  });

  it('passes only the prefs’ own cookies in server mode', async () => {
    const prefs = make();
    requestCookies({ theme: 'dark', sidebar: 'false', session: 'secret' });
    const element = await PrefsProvider({ prefs, mode: 'server', children: 'x' });
    expect(cookies).toHaveBeenCalledTimes(1);
    const props = element.props as { snapshot: PrefsSnapshot; script: string };
    expect(props.snapshot).toEqual({ theme: 'dark', sidebar: 'false' });
    expect(props.script).toBe(prefsScript(prefs));
  });

  it('never passes the pref handles to the client component', async () => {
    requestCookies({});
    const element = await PrefsProvider({ prefs: make(), mode: 'server' });
    expect(element.props).not.toHaveProperty('prefs');
    expect(JSON.parse(JSON.stringify(element.props))).toEqual(element.props);
  });

  it('server-renders exact values and the script in server mode', async () => {
    const prefs = make();
    requestCookies({ theme: 'dark', sidebar: 'false' });
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
