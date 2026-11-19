// @vitest-environment jsdom
import { parse } from 'acorn';
import { act, StrictMode, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme, type ThemeProviderProps, type UseThemeProps } from '../../index';
import { ThemeColor, type ThemeColorProps } from '../index';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const html = document.documentElement;
const COLORS = { light: '#ffffff', dark: '#0a0a0a' };

/** OS scheme, switchable at runtime: `matchMedia` with `change` listeners. */
let osDark = false;
const listeners = new Set<() => void>();
const setOs = (dark: boolean) => {
  osDark = dark;
  act(() => listeners.forEach((l) => l()));
};

beforeEach(() => {
  osDark = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query == '(prefers-color-scheme: dark)' && osDark;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  listeners.clear();
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
  for (const { name } of [...html.attributes]) html.removeAttribute(name);
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  localStorage.clear();
});

const ssr = (node: ReactNode) => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'document')!;
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true });
  try {
    return renderToString(node);
  } finally {
    Object.defineProperty(globalThis, 'document', desc);
  }
};

let api: UseThemeProps;
const Probe = () => {
  api = useTheme();
  return null;
};

const App = ({ props = {}, color = { colors: COLORS } }: { props?: ThemeProviderProps; color?: ThemeColorProps }) => (
  <ThemeProvider {...props}>
    <ThemeColor {...color} />
    <Probe />
  </ThemeProvider>
);

/** The theme-color script the server renders. */
const colorScript = (color: ThemeColorProps = { colors: COLORS }, props: ThemeProviderProps = {}) => {
  const div = document.createElement('div');
  div.innerHTML = ssr(<App props={props} color={color} />);
  return div.querySelectorAll('script')[1]!.textContent!;
};

/** The theme script the server renders. */
const themeScript = (props: ThemeProviderProps = {}) => {
  const div = document.createElement('div');
  div.innerHTML = ssr(<ThemeProvider {...props}>x</ThemeProvider>);
  return div.querySelector('script')!.textContent!;
};

/** Server HTML in a container, its inline scripts run in order, as the browser does before hydration. */
const serverPage = (node: ReactNode) => {
  const container = document.createElement('div');
  container.innerHTML = ssr(node);
  document.body.append(container);
  for (const s of container.querySelectorAll('script')) new Function(s.textContent!)();
  return container;
};

const metas = () =>
  [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => ({
    content: m.getAttribute('content'),
    media: m.getAttribute('media'),
    ours: m.getAttribute('property') == 'cookie-prefs',
  }));

const appMetas = () => {
  document.head.innerHTML =
    '<meta charset="utf-8">' +
    '<meta name="theme-color" content="#app-light" media="(prefers-color-scheme: light)">' +
    '<meta name="theme-color" content="#app-dark" media="(prefers-color-scheme: dark)">';
};

const APP = [
  { content: '#app-light', media: '(prefers-color-scheme: light)', ours: false },
  { content: '#app-dark', media: '(prefers-color-scheme: dark)', ours: false },
];

const mount = (node: ReactNode) => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return root;
};

describe('rendering', () => {
  it('renders only an inline script: text/javascript with the nonce on the server, text/plain without it on the client', () => {
    const server = ssr(<App color={{ colors: COLORS, nonce: 'abc' }} />);
    expect(server).not.toContain('<meta');
    const div = document.createElement('div');
    div.innerHTML = server;
    const script = div.querySelectorAll('script')[1]!;
    expect(script.getAttribute('type')).toBe('text/javascript');
    expect(script.getAttribute('nonce')).toBe('abc');

    const root = mount(<App color={{ colors: COLORS, nonce: 'abc' }} />);
    const client = document.body.querySelectorAll('script')[1]!;
    expect(client.getAttribute('type')).toBe('text/plain');
    expect(client.hasAttribute('nonce')).toBe(false);
    expect(client.textContent).toBe(script.textContent);
    act(() => root.unmount());
  });

  it('keeps its first script text when the colours change', () => {
    const root = mount(<App />);
    const script = document.body.querySelectorAll('script')[1]!;
    const text = script.textContent;
    act(() => root.render(<App color={{ colors: { light: '#eee', dark: '#111' } }} />));
    expect(document.body.querySelectorAll('script')[1]).toBe(script);
    expect(script.textContent).toBe(text);
    expect(metas()).toEqual([{ content: '#eee', media: null, ours: true }]);
    act(() => root.unmount());
  });
});

describe('inline script', () => {
  it('parses as ES5 and is fixed code plus the colours as JSON', () => {
    const scripts = [{ colors: COLORS }, { colors: { a: '1' } }, { colors: {} }].map((c) => colorScript(c));
    for (const s of scripts) expect(() => parse(s, { ecmaVersion: 5, sourceType: 'script' })).not.toThrow();
    expect(new Set(scripts.map((s) => s.slice(0, s.lastIndexOf('JSON.parse(')))).size).toBe(1);
    expect(scripts[0]).toMatch(/^\(function\(C\)\{.*\}\)\(JSON\.parse\(".*"\)\)$/);
  });

  it('resolves the theme with the theme script code, copied verbatim', () => {
    const source = colorScript();
    const copy = source.slice(source.indexOf('var x,h,y;') + 10, source.indexOf('if(x={}'));
    expect(copy).toMatch(/^if\(!f\)\{.*matchMedia.*;$/);
    const variants: ThemeProviderProps[] = [{}, { attribute: 'class', forcedTheme: 'dark', storageKey: 'k' }];
    for (const props of variants) {
      const theme = themeScript(props);
      expect(theme).toContain(copy);
      // how the script finds the theme script and its config
      expect(theme.startsWith('(function(k,l,a,m,d,f,s,c){')).toBe(true);
      expect(theme.indexOf('JSON.parse(') + 11).toBe(theme.lastIndexOf('("') + 1);
    }
  });

  it('escapes hostile colours and keys so they cannot leave the script element', () => {
    const hostile = '</script><script>alert(1)</script>';
    const colors = JSON.parse(`{"__proto__":"#123","dark":${JSON.stringify(hostile + '\u2028&')}}`) as Record<string, string>;
    const div = document.createElement('div');
    div.innerHTML = ssr(<App color={{ colors }} />);
    expect(div.querySelectorAll('script')).toHaveLength(2);
    const source = div.querySelectorAll('script')[1]!.textContent!;
    const literal = source.slice(source.lastIndexOf('JSON.parse(') + 11, -2);
    expect(literal).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(JSON.parse(literal) as string)).toEqual(colors);
    // a theme named __proto__ gets its own colour (own keys, like the theme script)
    document.cookie = 'theme=__proto__';
    serverPage(<App props={{ themes: ['__proto__', 'dark'], enableSystem: false, defaultTheme: 'dark' }} color={{ colors }} />);
    expect(metas()).toEqual([{ content: '#123', media: null, ours: true }]);
  });

  it('does nothing without a theme script before it', () => {
    new Function(colorScript())();
    expect(metas()).toEqual([]);
  });

  it('reads the closest theme script before it', () => {
    document.cookie = 'a=dark';
    document.cookie = 'b=light';
    const container = document.createElement('div');
    container.innerHTML = ssr(
      <>
        <ThemeProvider storageKey="a">x</ThemeProvider>
        <ThemeProvider storageKey="b">x</ThemeProvider>
      </>,
    );
    document.body.append(container);
    new Function(colorScript())();
    expect(metas()).toEqual([{ content: '#ffffff', media: null, ours: true }]);
  });

  it('adds no tag for a theme without a colour', () => {
    document.cookie = 'theme=sepia';
    serverPage(<App props={{ themes: ['light', 'dark', 'sepia'] }} />);
    expect(metas()).toEqual([]);
  });

  it('goes before the page tags and leaves them alone', () => {
    appMetas();
    document.cookie = 'theme=dark';
    serverPage(<App />);
    expect(metas()).toEqual([{ content: '#0a0a0a', media: null, ours: true }, ...APP]);
    expect(document.head.firstElementChild!.getAttribute('charset')).toBe('utf-8');
  });

  it('appends to <head> when the page has no tag, and reuses its own tag', () => {
    document.cookie = 'theme=dark';
    serverPage(<App />);
    serverPage(<App color={{ colors: { dark: '#000' } }} />);
    expect(document.head.lastElementChild!.getAttribute('content')).toBe('#000');
    expect(metas()).toEqual([{ content: '#000', media: null, ours: true }]);
  });
});

describe('client', () => {
  it('hydrates without warnings and keeps the tag the script added', () => {
    appMetas();
    document.cookie = 'theme=dark';
    // Server rendering is checked in `server.test.tsx`: here the modules were loaded with a
    // DOM, so React 18's server renderer would warn about the layout effects.
    const container = serverPage(<App color={{ colors: COLORS, nonce: 'n' }} />);
    const tag = document.querySelector('meta[property="cookie-prefs"]');
    expect(metas()).toEqual([{ content: '#0a0a0a', media: null, ours: true }, ...APP]);
    const errors = vi.spyOn(console, 'error');
    let root!: ReturnType<typeof hydrateRoot>;
    act(() => {
      root = hydrateRoot(container, <App color={{ colors: COLORS, nonce: 'n' }} />);
    });
    expect(errors).not.toHaveBeenCalled();
    expect(api.theme).toBe('dark');
    expect(document.querySelector('meta[property="cookie-prefs"]')).toBe(tag);
    expect(metas()).toEqual([{ content: '#0a0a0a', media: null, ours: true }, ...APP]);
    act(() => api.setTheme('light'));
    expect(metas()).toEqual([{ content: '#ffffff', media: null, ours: true }, ...APP]);
    act(() => root.unmount());
    expect(metas()).toEqual(APP);
  });

  it('follows setTheme and the OS scheme for system', () => {
    const root = mount(<App />);
    expect(metas()).toEqual([{ content: '#ffffff', media: null, ours: true }]);
    setOs(true);
    expect(metas()).toEqual([{ content: '#0a0a0a', media: null, ours: true }]);
    act(() => api.setTheme('light'));
    expect(metas()).toEqual([{ content: '#ffffff', media: null, ours: true }]);
    setOs(false);
    setOs(true);
    expect(metas()).toEqual([{ content: '#ffffff', media: null, ours: true }]);
    act(() => api.setTheme('system'));
    expect(metas()).toEqual([{ content: '#0a0a0a', media: null, ours: true }]);
    act(() => root.unmount());
  });

  it('follows forcedTheme, a forced system included', () => {
    document.cookie = 'theme=light';
    const root = mount(<App props={{ forcedTheme: 'dark' }} />);
    expect(metas()).toEqual([{ content: '#0a0a0a', media: null, ours: true }]);
    act(() => root.render(<App props={{ forcedTheme: 'system' }} />));
    expect(metas()).toEqual([{ content: '#ffffff', media: null, ours: true }]);
    setOs(true);
    expect(metas()).toEqual([{ content: '#0a0a0a', media: null, ours: true }]);
    act(() => root.render(<App />));
    expect(metas()).toEqual([{ content: '#ffffff', media: null, ours: true }]);
    act(() => root.unmount());
  });

  it('follows a cookie changed elsewhere once the tab is shown again', () => {
    const root = mount(<App props={{ defaultTheme: 'light' }} />);
    expect(metas()[0]!.content).toBe('#ffffff');
    document.cookie = 'theme=dark; Path=/';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(metas()).toEqual([{ content: '#0a0a0a', media: null, ours: true }]);
    act(() => root.unmount());
  });

  it('custom themes and value keys; a theme without a colour hands over to the page tags', () => {
    appMetas();
    const colors = { light: '#fff', dark: '#000', sepia: '#704214', pink: '#ff69b4' };
    const root = mount(<App props={{ themes: ['light', 'dark', 'sepia', 'mint'], value: { pink: 'p' } }} color={{ colors }} />);
    act(() => api.setTheme('sepia'));
    expect(metas()).toEqual([{ content: '#704214', media: null, ours: true }, ...APP]);
    act(() => api.setTheme('pink'));
    expect(metas()[0]!.content).toBe('#ff69b4');
    act(() => api.setTheme('mint'));
    expect(metas()).toEqual(APP);
    act(() => api.setTheme('dark'));
    expect(metas()).toEqual([{ content: '#000', media: null, ours: true }, ...APP]);
    act(() => root.unmount());
  });

  it('moves its tag back in front of a page tag added before it', () => {
    const root = mount(<App />);
    const late = document.createElement('meta');
    late.name = 'theme-color';
    late.content = '#late';
    document.head.prepend(late);
    act(() => api.setTheme('dark'));
    expect(metas()).toEqual([
      { content: '#0a0a0a', media: null, ours: true },
      { content: '#late', media: null, ours: false },
    ]);
    act(() => root.unmount());
  });

  it('keeps one tag under Strict Mode and removes it on unmount', () => {
    document.cookie = 'theme=dark';
    const root = mount(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(metas()).toEqual([{ content: '#0a0a0a', media: null, ours: true }]);
    act(() => root.unmount());
    expect(metas()).toEqual([]);
  });

  it('does nothing outside a provider', () => {
    const root = mount(<ThemeColor colors={COLORS} />);
    expect(metas()).toEqual([]);
    act(() => root.unmount());
  });
});
