// @vitest-environment jsdom
import { cookies, headers } from 'next/headers.js';
// The store class behind `cookies()`, built by Next from the same request headers.
import { RequestCookies } from 'next/dist/server/web/spec-extension/cookies';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { definePrefs, pref, snapshotPrefs } from '../../index';
import { ThemeProvider, useTheme, type ThemeProviderProps } from '../index';
import { getTheme } from '../next/index';
import { readTheme } from '../server/index';

vi.mock('next/headers.js', () => ({ cookies: vi.fn(), headers: vi.fn() }));

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no `matchMedia`: the OS scheme is light
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

const html = document.documentElement;

afterEach(() => {
  for (const { name } of [...html.attributes]) html.removeAttribute(name);
  localStorage.clear();
  document.body.innerHTML = '';
  Reflect.deleteProperty(document, 'cookie');
});

/**
 * `document.cookie` as this text. jsdom normalises cookies (no duplicates, no quotes
 * kept as sent), so the table fakes it. Writes (the provider's Safari refresh) are dropped.
 */
const fakeCookie = (text: string) =>
  Object.defineProperty(document, 'cookie', { configurable: true, get: () => text, set: () => {} });

/** `useTheme().theme` once the client provider has mounted and run its effects. */
const clientTheme = (props: ThemeProviderProps) => {
  let theme: string | undefined;
  const Probe = () => {
    theme = useTheme().theme;
    return null;
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <ThemeProvider {...props}>
        <Probe />
      </ThemeProvider>,
    ),
  );
  act(() => root.unmount());
  container.remove();
  return theme;
};

/** What the inline script the server renders for these props writes on `<html>`. */
const scriptDom = (props: ThemeProviderProps) => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'document')!;
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true });
  let markup: string;
  try {
    markup = renderToString(<ThemeProvider {...props} attribute="data-probe" enableColorScheme={false} />);
  } finally {
    Object.defineProperty(globalThis, 'document', desc);
  }
  const div = document.createElement('div');
  div.innerHTML = markup;
  new Function(div.querySelector('script')!.textContent!)();
  return html.getAttribute('data-probe');
};

/** `getTheme()` for a request that carries this `Cookie` header, mocked as Next builds it. */
const nextTheme = (header: string, props: ThemeProviderProps) => {
  const request = new Headers(header ? { cookie: header } : {});
  vi.mocked(headers).mockResolvedValue(request as never);
  vi.mocked(cookies).mockResolvedValue(new RequestCookies(request) as never);
  return getTheme(props);
};

/** Cookie headers, as the browser sends them and `document.cookie` shows them. */
const jar = [
  '',
  'theme=dark',
  'theme=light',
  'theme=system',
  'theme=sepia',
  'theme=pink',
  'theme=blue',
  'theme=DARK',
  'theme=',
  'theme',
  'theme=%E0%A4%A',
  'theme="dark"',
  'theme=%64ark',
  'theme= dark',
  'theme=dark; theme=light',
  'theme=blue; theme=dark',
  'other=1; theme=dark',
  'xtheme=dark',
  'theme=__proto__',
  'theme=toString',
  'theme=constructor',
  'theme=' + 'd'.repeat(5000),
  'my%20theme=high%20contrast',
  'my%20theme=dark; theme=light',
  'my theme=dark',
];

const configs: Record<string, ThemeProviderProps> = {
  defaults: {},
  'enableSystem off': { enableSystem: false },
  'default dark': { defaultTheme: 'dark' },
  'default system, enableSystem off': { defaultTheme: 'system', enableSystem: false },
  'custom themes': { themes: ['light', 'dark', 'sepia'], defaultTheme: 'dark' },
  'value key outside themes': { value: { pink: 'my-pink', dark: 'd' } },
  'storage key with a space': { storageKey: 'my theme', themes: ['high contrast', 'dark'], defaultTheme: 'dark' },
  'prototype names': { themes: ['__proto__', 'toString', 'dark'], enableSystem: false, defaultTheme: 'dark' },
  'value keys from JSON': { value: JSON.parse('{"__proto__":"p","constructor":"c"}') as Record<string, string> },
  'no themes': { themes: [], enableSystem: false, defaultTheme: 'none' },
  'unlisted next-themes default': { themes: ['red', 'blue'], enableSystem: false },
  'forced theme': { forcedTheme: 'dark', defaultTheme: 'light' },
  'cookie attributes': { cookie: { domain: 'example.com', maxAge: 60 }, defaultTheme: 'dark' },
};

describe('readTheme and getTheme agree with ThemeProvider and its script', () => {
  const rows = Object.entries(configs).flatMap(([name, props]) =>
    jar.map((cookie) => [name, cookie.length > 100 ? cookie.slice(0, 20) + '…' : cookie, cookie, props] as const),
  );

  it.each(rows)('%s, cookie %j', async (_, __, cookie, props) => {
    fakeCookie(cookie);
    const client = clientTheme(props);
    expect(client).toBeTypeOf('string');
    const server = readTheme(cookie, props);
    expect(server).toBe(client);
    expect(await nextTheme(cookie, props)).toBe(client);
    // a snapshot of the request, as `snapshotPrefs` builds it, reads the same
    const raw = definePrefs({ theme: pref.string().options({ name: props.storageKey ?? 'theme' }) });
    expect(readTheme(snapshotPrefs(raw, cookie), props)).toBe(client);

    // The script shows the same stored theme: forced first, `system` resolved (light
    // OS), then mapped through `value`.
    let shown = props.forcedTheme || server;
    if (shown == 'system' && props.enableSystem !== false) shown = 'light';
    const value = props.value ?? {};
    expect(scriptDom(props)).toBe(Object.hasOwn(value, shown) ? value[shown] : shown);
  });
});
