import { parse } from 'acorn';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, type ThemeProviderProps } from '../index';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const html = document.documentElement;

const clearCookies = () => {
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
};

const resetHtml = () => {
  for (const { name } of [...html.attributes]) html.removeAttribute(name);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearCookies();
  resetHtml();
  localStorage.clear();
  document.body.innerHTML = '';
});

/** `matchMedia` for `prefers-color-scheme: dark`, as jsdom has none. */
const mockSystem = (dark: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query == '(prefers-color-scheme: dark)' && dark,
    addEventListener() {},
    removeEventListener() {},
  }));

/** Render on the server: no `document`, like Node. Other stubs stay in place. */
const ssr = (node: ReactNode) => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'document')!;
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true });
  try {
    return renderToString(node);
  } finally {
    Object.defineProperty(globalThis, 'document', desc);
  }
};

/** The inline script the server renders for these props. */
const serverScript = (props: ThemeProviderProps = {}) => {
  const div = document.createElement('div');
  div.innerHTML = ssr(<ThemeProvider {...props}>x</ThemeProvider>);
  return div.querySelector('script')!.textContent!;
};

/** `<html>` as the user sees it. */
const state = () => ({
  className: html.className,
  attrs: Object.fromEntries([...html.attributes].map((a) => [a.name, a.value])),
  colorScheme: html.style.colorScheme,
});

/** Mount the provider on the client only; it applies the theme with DOM calls. */
const clientApply = (props: ThemeProviderProps) => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<ThemeProvider {...props}>x</ThemeProvider>));
  const result = state();
  act(() => root.unmount());
  container.remove();
  return result;
};

const hostile = '</script><script>alert(1)</script>';

interface Row {
  props?: ThemeProviderProps;
  cookie?: string;
  storage?: string | 'throws';
  dark?: boolean;
  expected: Partial<ReturnType<typeof state>>;
}

const rows: Record<string, Row> = {
  'defaults, no cookie, light OS': {
    expected: { attrs: { 'data-theme': 'light', style: 'color-scheme: light;' } },
  },
  'defaults, no cookie, dark OS': {
    dark: true,
    expected: { attrs: { 'data-theme': 'dark', style: 'color-scheme: dark;' } },
  },
  'stored theme': { cookie: 'theme=dark', expected: { attrs: { 'data-theme': 'dark', style: 'color-scheme: dark;' } } },
  'stored system': { cookie: 'theme=system', dark: true, expected: { colorScheme: 'dark' } },
  'invalid cookie reads as default': { cookie: 'theme=blue', props: { defaultTheme: 'dark' }, expected: { colorScheme: 'dark' } },
  'malformed cookie reads as default': { cookie: 'theme=%E0%A4%A', props: { defaultTheme: 'dark' }, expected: { colorScheme: 'dark' } },
  'quoted cookie': { cookie: 'theme="dark"', expected: { colorScheme: 'dark' } },
  'prototype keys are not themes': { cookie: 'theme=__proto__', props: { defaultTheme: 'dark' }, expected: { colorScheme: 'dark' } },
  'class, enableSystem off, light default': {
    props: { attribute: 'class', enableSystem: false },
    cookie: 'theme=system',
    dark: true,
    expected: { className: 'light', colorScheme: 'light' },
  },
  'class attribute with a stored theme': {
    props: { attribute: 'class' },
    cookie: 'theme=dark',
    expected: { className: 'dark' },
  },
  'array attribute with value map': {
    props: { attribute: ['class', 'data-mode'], value: { dark: 'is-dark', light: 'is-light' } },
    cookie: 'theme=dark',
    expected: { className: 'is-dark', attrs: { class: 'is-dark', 'data-mode': 'is-dark', style: 'color-scheme: dark;' } },
  },
  'value key outside themes (README example)': {
    props: { value: { pink: 'my-pink-theme' } },
    cookie: 'theme=pink',
    expected: { attrs: { 'data-theme': 'my-pink-theme' }, colorScheme: '' },
  },
  'custom themes, color-scheme falls back to a light/dark default': {
    props: { themes: ['light', 'dark', 'sepia'], defaultTheme: 'dark' },
    cookie: 'theme=sepia',
    expected: { attrs: { 'data-theme': 'sepia', style: 'color-scheme: dark;' } },
  },
  'enableColorScheme off': {
    props: { enableColorScheme: false },
    cookie: 'theme=dark',
    expected: { attrs: { 'data-theme': 'dark' } },
  },
  'forced theme wins over the cookie': {
    props: { forcedTheme: 'dark', attribute: 'class' },
    cookie: 'theme=light',
    expected: { className: 'dark' },
  },
  'forced system is resolved': {
    props: { forcedTheme: 'system' },
    dark: true,
    expected: { attrs: { 'data-theme': 'dark', style: 'color-scheme: dark;' } },
  },
  'encoded storage key and theme names': {
    props: { storageKey: 'my theme', themes: ['high contrast', 'dark'], defaultTheme: 'dark', attribute: 'data-look' },
    cookie: 'my%20theme=high%20contrast',
    expected: { attrs: { 'data-look': 'high contrast', style: 'color-scheme: dark;' } },
  },
  'hostile theme names': {
    props: { themes: [hostile, 'a&b\u2028'], defaultTheme: hostile },
    cookie: 'theme=' + encodeURIComponent('a&b\u2028'),
    expected: { attrs: { 'data-theme': 'a&b\u2028' } },
  },
  'next-themes value in localStorage, no cookie': {
    storage: 'dark',
    expected: { attrs: { 'data-theme': 'dark', style: 'color-scheme: dark;' } },
  },
  'invalid localStorage value': {
    storage: 'blue',
    props: { defaultTheme: 'dark' },
    expected: { colorScheme: 'dark' },
  },
  'cookie wins over localStorage': {
    storage: 'light',
    cookie: 'theme=dark',
    expected: { colorScheme: 'dark' },
  },
  'localStorage throws': {
    storage: 'throws',
    props: { defaultTheme: 'dark' },
    expected: { colorScheme: 'dark' },
  },
};

describe('inline script and client parity', () => {
  it.each(Object.entries(rows))('%s', (_, { props = {}, cookie, storage, dark = false, expected }) => {
    mockSystem(dark);
    const setup = () => {
      clearCookies();
      resetHtml();
      if (cookie) document.cookie = cookie;
      if (storage == 'throws')
        vi.stubGlobal('localStorage', {
          getItem() {
            throw new DOMException('denied', 'SecurityError');
          },
        });
      else if (storage) localStorage.setItem(props.storageKey ?? 'theme', storage);
    };

    setup();
    new Function(serverScript(props))();
    const fromScript = state();
    expect(fromScript).toMatchObject(expected);

    setup();
    expect(clientApply(props)).toEqual(fromScript);
  });
});

describe('script source', () => {
  const variants: ThemeProviderProps[] = [
    {},
    { attribute: ['class', 'data-mode'], value: { dark: 'd' }, forcedTheme: 'dark', storageKey: 'k' },
    { themes: [hostile], defaultTheme: hostile, enableSystem: false, enableColorScheme: false },
  ];

  it('parses as ES5', () => {
    for (const props of variants)
      expect(() => parse(serverScript(props), { ecmaVersion: 5, sourceType: 'script' })).not.toThrow();
  });

  it('is fixed code plus JSON config', () => {
    const scripts = variants.map(serverScript);
    const code = scripts.map((s) => s.slice(0, s.indexOf('.apply(0,')));
    expect(new Set(code).size).toBe(1);
    expect(scripts[0]).toMatch(/^\(function\(k,l,a,m,d,f,s,c\)\{.*\}\)\.apply\(0,\[.*\]\)$/);
  });

  it('escapes hostile theme names so they cannot leave the script element', () => {
    const div = document.createElement('div');
    div.innerHTML = ssr(<ThemeProvider themes={[hostile, '<!--', '&amp;', '\u2028\u2029']}>x</ThemeProvider>);
    expect(div.querySelectorAll('script')).toHaveLength(1);
    const script = div.querySelector('script')!.textContent!;
    const json = script.slice(script.indexOf('.apply(0,') + 9, -1);
    expect(json).not.toMatch(/[<>&\u2028\u2029]/);
    // the JSON still holds the original names
    expect(JSON.parse(json)[3]).toHaveProperty([hostile], hostile);
  });

  it('is identical however the bundle was compiled (next-themes #370)', () => {
    const props: ThemeProviderProps = { attribute: 'class', forcedTheme: 'dark' };
    const before = serverScript(props);
    // What `keepNames` / SWC do to function source: next-themes inlines
    // `fn.toString()`, so the helper call ends up in the page without its definition.
    const original = Function.prototype.toString;
    const toString = vi.spyOn(Function.prototype, 'toString').mockImplementation(function (this: () => void) {
      return original.call(this).replace('{', '{__name(0, "x");');
    });
    const after = serverScript(props);
    const nextThemesLike = `(${function () {
      document.documentElement.classList.add('dark');
    }.toString()})()`;
    toString.mockRestore();

    expect(after).toBe(before);
    expect(after).not.toContain('__name');
    expect(() => new Function(after)()).not.toThrow();
    expect(html.className).toBe('dark');
    // control: the toString approach breaks under the same transform
    expect(() => new Function(nextThemesLike)()).toThrow(/__name/);
  });
});
