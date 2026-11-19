// @vitest-environment jsdom
import { parse } from 'acorn';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, type ThemeProviderProps } from '../index';
import { hostile, rows, type HtmlState } from './rows';

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
const state = (): HtmlState => ({
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
    const code = scripts.map((s) => s.slice(0, s.indexOf('.apply(0,JSON.parse(')));
    expect(new Set(code).size).toBe(1);
    expect(scripts[0]).toMatch(/^\(function\(k,l,a,m,d,f,s,c\)\{.*\}\)\.apply\(0,JSON\.parse\(".*"\)\)$/);
  });

  it('escapes hostile theme names so they cannot leave the script element', () => {
    const div = document.createElement('div');
    div.innerHTML = ssr(<ThemeProvider themes={[hostile, '<!--', '&amp;', '\u2028\u2029']}>x</ThemeProvider>);
    expect(div.querySelectorAll('script')).toHaveLength(1);
    const script = div.querySelector('script')!.textContent!;
    const literal = script.slice(script.indexOf('.apply(0,JSON.parse(') + 20, -2);
    expect(literal).not.toMatch(/[<>&\u2028\u2029]/);
    // the string literal still holds the JSON of the original names
    const config = JSON.parse(JSON.parse(literal) as string) as unknown[];
    expect(config[3]).toHaveProperty([hostile], hostile);
    expect(config[3]).toHaveProperty(['\u2028\u2029'], '\u2028\u2029');
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
