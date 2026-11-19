// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, type ThemeProviderProps } from '../../index';
import { rows } from '../../__tests__/rows';
import { ThemeColor } from '../index';

// The theme-color script resolves the theme with a copy of the theme script's code and
// the client follows `useTheme()`: both must show the colour of the theme the theme
// script paints, for every row of the theme parity table.

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const html = document.documentElement;

const clearCookies = () => {
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
};

const reset = () => {
  clearCookies();
  for (const { name } of [...html.attributes]) html.removeAttribute(name);
  document.head.innerHTML = '';
  document.body.innerHTML = '';
};

afterEach(() => {
  vi.unstubAllGlobals();
  reset();
  localStorage.clear();
});

const mockSystem = (dark: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query == '(prefers-color-scheme: dark)' && dark,
    addEventListener() {},
    removeEventListener() {},
  }));

const ssr = (node: ReactNode) => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'document')!;
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true });
  try {
    return renderToString(node);
  } finally {
    Object.defineProperty(globalThis, 'document', desc);
  }
};

const tree = (props: ThemeProviderProps, colors: Record<string, string>) => (
  <ThemeProvider {...props}>
    <ThemeColor colors={colors} />
  </ThemeProvider>
);

/** Content of the owned tag; `null` when there is none. */
const owned = () => document.querySelector('meta[property="cookie-prefs"]')?.getAttribute('content') ?? null;

/** The server HTML parsed into the body (scripts inert), then both inline scripts run in order. */
const beforeHydration = (props: ThemeProviderProps, colors: Record<string, string>) => {
  document.body.innerHTML = ssr(tree(props, colors));
  const [theme, color] = [...document.body.querySelectorAll('script')].map((s) => s.textContent!);
  new Function(theme!)();
  new Function(color!)();
  const result = owned();
  document.body.innerHTML = '';
  return result;
};

/** Mounted on the client only: the provider paints with DOM calls, `ThemeColor` follows `useTheme()`. */
const client = (props: ThemeProviderProps, colors: Record<string, string>) => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(tree(props, colors)));
  const result = owned();
  act(() => root.unmount());
  container.remove();
  expect(owned(), 'removed on unmount').toBeNull();
  return result;
};

/** Every name a row can resolve to, each with a colour that names it. */
const allColors = ({ themes = ['light', 'dark'], value, forcedTheme }: ThemeProviderProps) =>
  Object.fromEntries(
    [...themes, ...Object.keys(value ?? {}), 'light', 'dark', 'system', forcedTheme ?? 'light'].map((t) => [t, 'c:' + t]),
  );

/** The DOM string the theme script wrote for the first target, as `paint` writes it. */
const painted = ({ attribute = 'data-theme' }: ThemeProviderProps) => {
  const first = ([] as string[]).concat(attribute)[0]!;
  return first == 'class' ? html.className : html.getAttribute(first);
};

describe('theme-color script and client parity over the theme table', () => {
  it.each(Object.entries(rows))('%s', (_, { props = {}, cookie, storage, dark = false }) => {
    mockSystem(dark);
    const setup = () => {
      reset();
      if (cookie) document.cookie = cookie;
      if (storage == 'throws')
        vi.stubGlobal('localStorage', {
          getItem() {
            throw new DOMException('denied', 'SecurityError');
          },
          removeItem() {
            throw new DOMException('denied', 'SecurityError');
          },
        });
      else if (storage) localStorage.setItem(props.storageKey ?? 'theme', storage);
    };

    for (const colors of [allColors(props), { dark: 'c:dark' }]) {
      setup();
      const script = beforeHydration(props, colors);
      // the colour belongs to the theme the theme script painted
      if (script != null) {
        const name = script.slice(2);
        const dom = props.value && ({}).hasOwnProperty.call(props.value, name) ? props.value[name] : name;
        expect(painted(props)).toBe(dom);
      }
      setup();
      expect(client(props, colors), JSON.stringify(colors)).toBe(script);
    }
    // the full map always has a colour
    setup();
    expect(beforeHydration(props, allColors(props))).not.toBeNull();
  });
});
