import { parse } from 'acorn';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme, type ThemeProviderProps, type UseThemeProps } from '../index';

// Attacks on the theme preset: hostile props in the inline script, hostile cookies and
// localStorage values on both the script and the client, and a hostile setTheme().

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

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  delete (document as { cookie?: string }).cookie;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearCookies();
  resetHtml();
  localStorage.clear();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  delete (globalThis as { pwned?: unknown }).pwned;
});

const mockSystem = (dark: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query == '(prefers-color-scheme: dark)' && dark,
    addEventListener() {},
    removeEventListener() {},
  }));

/** Render on the server: no `document`, like Node. */
const ssr = (node: ReactNode) => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'document')!;
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true });
  try {
    return renderToString(node);
  } finally {
    Object.defineProperty(globalThis, 'document', desc);
  }
};

const state = () => ({
  className: html.className,
  attrs: Object.fromEntries([...html.attributes].map((a) => [a.name, a.value])),
});

/** The server markup parsed like a browser parses it. */
const serverDom = (props: ThemeProviderProps) => {
  const div = document.createElement('div');
  div.innerHTML = ssr(<ThemeProvider {...props}>child</ThemeProvider>);
  return div;
};

const runServerScript = (props: ThemeProviderProps) => {
  resetHtml();
  new Function(serverDom(props).querySelector('script')!.textContent!)();
  return state();
};

const clientState = (props: ThemeProviderProps) => {
  resetHtml();
  const container = document.createElement('div');
  const r = createRoot(container);
  act(() => r.render(<ThemeProvider {...props}>x</ThemeProvider>));
  const result = state();
  act(() => r.unmount());
  return result;
};

const breakout = '</script><script>globalThis.pwned=1</script><!--<script>';
const hostile = [breakout, '"};globalThis.pwned=1;//', "'+(globalThis.pwned=1)+'", '\\', '  ', '<!--', '-->', ']]>', '&amp;', '😀'.slice(1)];

describe('hostile props cannot leave the inline script', () => {
  const variants: [string, ThemeProviderProps][] = hostile.flatMap((h) => [
    [`themes ${JSON.stringify(h)}`, { themes: [h, 'dark'], defaultTheme: h }],
    // a lone surrogate cannot be a cookie name at all (`encodeURIComponent` throws)
    ...(h == '😀'.slice(1) ? [] : [[`storageKey ${JSON.stringify(h)}`, { storageKey: h }] as [string, ThemeProviderProps]]),
    [`forcedTheme ${JSON.stringify(h)}`, { forcedTheme: h }],
    [`value ${JSON.stringify(h)}`, { value: { [h]: h, dark: h } }],
    [`attribute ${JSON.stringify(h)}`, { attribute: [`data-${h}` as `data-${string}`, 'class'] }],
    [`nonce ${JSON.stringify(h)}`, { nonce: h, scriptProps: { id: h, 'data-x': h } }],
  ]);

  it.each(variants)('%s', (_, props) => {
    mockSystem(false);
    const dom = serverDom(props);
    const scripts = dom.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(dom.textContent).toBe(scripts[0]!.textContent + 'child');
    if (props.nonce) expect(scripts[0]!.getAttribute('nonce')).toBe(props.nonce);
    const source = scripts[0]!.textContent!;
    expect(() => parse(source, { ecmaVersion: 5, sourceType: 'script' })).not.toThrow();
    expect(() => new Function(source)()).not.toThrow();
    expect((globalThis as { pwned?: unknown }).pwned).toBeUndefined();
  });

  it('a hostile stored theme is written as text, never markup', () => {
    mockSystem(false);
    const props: ThemeProviderProps = { themes: [breakout, 'dark'], attribute: ['data-theme', 'class'] };
    document.cookie = `theme=${encodeURIComponent(breakout)}`;
    const fromScript = runServerScript(props);
    expect(fromScript.attrs['data-theme']).toBe(breakout);
    expect(clientState(props)).toEqual(fromScript);
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });
});

/** Random `document.cookie` strings in the shape browsers produce. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('the script and the client agree on hostile cookies and storage', () => {
  const values = [
    'dark',
    'light',
    'system',
    'sepia',
    'high%20contrast',
    'high contrast',
    '"dark"',
    '%22dark%22',
    'dar%6B',
    'DARK',
    '',
    '=',
    'dark=1',
    '%E0%A4%A',
    '%',
    'toString',
    'constructor',
    'hasOwnProperty',
    'valueOf',
    '%3C%2Fscript%3E',
    'a%2Bb',
    'pink',
  ];
  const names = ['theme', 'xtheme', 'theme2', 'Theme', 'my%20theme', 'th'];
  const configs: ThemeProviderProps[] = [
    {},
    { attribute: 'class', enableSystem: false, defaultTheme: 'dark' },
    { attribute: ['class', 'data-mode'], themes: ['light', 'dark', 'sepia', 'high contrast'], value: { pink: 'p', dark: 'd' } },
    { storageKey: 'my theme', forcedTheme: 'system' },
    { themes: ['toString', 'light'], defaultTheme: 'toString', enableColorScheme: false },
  ];

  it('for generated cookie strings and storage values', () => {
    const next = random(0x7e);
    const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
    for (let i = 0; i < 120; i++) {
      const props = configs[i % configs.length]!;
      mockSystem(next() < 0.5);
      const parts: string[] = [];
      for (let n = Math.floor(next() * 4); n-- > 0; ) parts.push(`${pick(names)}=${pick(values)}`);
      const cookie = parts.join('; ');
      // real cookies, so the client's one-time move from localStorage can stick
      const stored = next() < 0.3 ? pick(values) : null;
      const setup = () => {
        clearCookies();
        for (const part of parts) document.cookie = part;
        localStorage.clear();
        if (stored != null) localStorage.setItem(props.storageKey ?? 'theme', stored);
      };
      setup();
      const fromScript = runServerScript(props);
      setup();
      expect(clientState(props), `${JSON.stringify(props)} | ${cookie} | ${stored}`).toEqual(fromScript);
    }
  });
});

describe('setTheme with hostile input', () => {
  let current: UseThemeProps;
  const Probe = () => {
    current = useTheme();
    return null;
  };
  const mount = (props: ThemeProviderProps = {}) => {
    const container = document.createElement('div');
    root = createRoot(container);
    act(() =>
      root!.render(
        <ThemeProvider {...props}>
          <Probe />
        </ThemeProvider>,
      ),
    );
  };
  const set = (value: unknown) => act(() => current.setTheme(value as never));

  it('ignores names outside the list, prototype members and non-strings', () => {
    mockSystem(false);
    mount();
    set('dark');
    for (const bad of ['__proto__', 'toString', 'constructor', 'hasOwnProperty', '', 'DARK', ' dark', undefined, null, 1, {}, ['dark']])
      set(bad);
    expect(current.theme).toBe('dark');
    expect(document.cookie).toBe('theme=dark');
    expect(html.getAttribute('data-theme')).toBe('dark');
  });

  it('takes updaters, also ones returning invalid names or chaining', () => {
    mockSystem(true);
    mount({ themes: ['light', 'dark', 'sepia'] });
    set((t: string) => (t == 'system' ? 'sepia' : 'light'));
    expect(current.theme).toBe('sepia');
    set(() => 'nope');
    expect(current.theme).toBe('sepia');
    act(() => {
      current.setTheme('light');
      current.setTheme((t) => (t == 'light' ? 'dark' : 'light'));
    });
    expect(current.theme).toBe('dark');
    expect(html.getAttribute('data-theme')).toBe('dark');
  });

  it('a stored theme that a new themes prop drops reads as the default on both sides', () => {
    mockSystem(false);
    mount({ themes: ['light', 'dark', 'sepia'] });
    set('sepia');
    act(() =>
      root!.render(
        <ThemeProvider themes={['light', 'dark']} defaultTheme="dark">
          <Probe />
        </ThemeProvider>,
      ),
    );
    expect(current.theme).toBe('dark');
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(runServerScript({ themes: ['light', 'dark'], defaultTheme: 'dark' }).attrs['data-theme']).toBe('dark');
  });
});
