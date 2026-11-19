// @vitest-environment jsdom
import * as React from 'react';
import { act, Profiler, StrictMode, version, type ComponentType, type ReactNode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../index';
import { ThemeProvider, useTheme, type ThemeProviderProps, type UseThemeProps } from '../index';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const html = document.documentElement;

const clearCookies = () => {
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
};

/** What React dev Strict Mode remounts can do to `<html>`. */
const wipeHtml = () => {
  for (const { name } of [...html.attributes]) html.removeAttribute(name);
};

/** `matchMedia` for `prefers-color-scheme: dark` with live `change` events; jsdom has none. */
const mockSystem = (dark = false) => {
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query == '(prefers-color-scheme: dark)' && dark;
    },
    addEventListener: (_: 'change', listener: () => void) => listeners.add(listener),
    removeEventListener: (_: 'change', listener: () => void) => listeners.delete(listener),
  }));
  return {
    listeners,
    set: (value: boolean) =>
      act(() => {
        dark = value;
        listeners.forEach((listener) => listener());
      }),
  };
};

let system: ReturnType<typeof mockSystem>;
let root: Root | undefined;

beforeEach(() => {
  system = mockSystem();
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  clearCookies();
  localStorage.clear();
  wipeHtml();
});

/** Latest `useTheme()` result and every render's `[theme, resolvedTheme, systemTheme]`. */
let current: UseThemeProps;
let renders: unknown[][];
const Probe = () => {
  current = useTheme();
  renders.push([current.theme, current.resolvedTheme, current.systemTheme]);
  return <p>{`${current.theme} ${current.resolvedTheme}`}</p>;
};
beforeEach(() => {
  renders = [];
});

const app = (props: ThemeProviderProps = {}) => (
  <ThemeProvider {...props}>
    <Probe />
  </ThemeProvider>
);

const render = (node: ReactNode) => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
};

const rerender = (node: ReactNode) => act(() => root!.render(node));

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

/** Server markup, with the inline script run as the browser would while parsing. */
const serve = (node: ReactNode) => {
  const container = document.createElement('div');
  container.innerHTML = ssr(node);
  new Function(container.querySelector('script')!.textContent!)();
  return container.innerHTML;
};

/** Hydrate server markup in a fresh container, recording every React error. */
const hydrate = async (node: ReactNode, markup: string) => {
  const container = document.createElement('div');
  container.innerHTML = markup;
  document.body.append(container);
  const errors = vi.spyOn(console, 'error');
  const recoverable = vi.fn();
  await act(async () => {
    root = hydrateRoot(container, node, { onRecoverableError: recoverable });
  });
  return { container, errors, recoverable };
};

const set = (value: Parameters<UseThemeProps['setTheme']>[0]) => act(() => current.setTheme(value));

const cookie = (name: string) =>
  document.cookie
    .split('; ')
    .find((pair) => pair.startsWith(name + '='))
    ?.slice(name.length + 1);

/**
 * Enforced Trusted Types, as far as scripts go: assigning script text throws. Returns
 * the restore function.
 */
const blockScriptText = () => {
  const proto = HTMLScriptElement.prototype;
  const keys = ['text', 'textContent', 'innerHTML'] as const;
  const own = keys.map((key) => [key, Object.getOwnPropertyDescriptor(proto, key)] as const);
  for (const key of keys) {
    let from: object = proto;
    let desc: PropertyDescriptor | undefined;
    while (!(desc = Object.getOwnPropertyDescriptor(from, key))) from = Object.getPrototypeOf(from) as object;
    Object.defineProperty(proto, key, {
      configurable: true,
      get: desc.get!,
      set() {
        throw new TypeError(`Failed to set '${key}': this document requires 'TrustedScript' assignment.`);
      },
    });
  }
  return () => {
    for (const [key, desc] of own)
      if (desc) Object.defineProperty(proto, key, desc);
      else delete (proto as unknown as Record<string, unknown>)[key];
  };
};

/**
 * Records every `dangerouslySetInnerHTML` value React stores on a script element, at
 * hydration and on each update. React 19.0 to 19.2 re-write `innerHTML` whenever that
 * object is not the one of the previous render, even with the same text. Returns the
 * list and the restore function.
 */
const recordScriptHtml = () => {
  const probe = document.createElement('div');
  const probeRoot = createRoot(probe);
  act(() => probeRoot.render(<i />));
  const key = Object.keys(probe.firstChild!).find((k) => k.startsWith('__reactProps$'))!;
  act(() => probeRoot.unmount());
  const values: unknown[] = [];
  const props = new WeakMap<object, unknown>();
  Object.defineProperty(HTMLScriptElement.prototype, key, {
    configurable: true,
    get(this: object) {
      return props.get(this);
    },
    set(this: object, next: { dangerouslySetInnerHTML?: unknown }) {
      values.push(next.dangerouslySetInnerHTML);
      props.set(this, next);
    },
  });
  return { values, restore: () => delete (HTMLScriptElement.prototype as unknown as Record<string, unknown>)[key] };
};

it('exports the theme api', () => {
  expect(Object.keys(entry).sort()).toEqual(['ThemeProvider', 'useTheme']);
});

describe('useTheme', () => {
  it('returns the next-themes defaults outside a provider', () => {
    render(<Probe />);
    expect(current).toEqual({ themes: [], setTheme: expect.any(Function) });
    current.setTheme('dark');
    expect(document.cookie).toBe('');
  });

  it('returns the next-themes fields with the default props', () => {
    render(app());
    expect(current).toEqual({
      theme: 'system',
      resolvedTheme: 'light',
      systemTheme: 'light',
      forcedTheme: undefined,
      themes: ['light', 'dark', 'system'],
      setTheme: expect.any(Function),
    });
    expect(html.getAttribute('data-theme')).toBe('light');
    expect(html.style.colorScheme).toBe('light');
  });

  it('stores a value in the storageKey cookie', () => {
    render(app());
    set('dark');
    expect(cookie('theme')).toBe('dark');
    expect(current.theme).toBe('dark');
    expect(current.resolvedTheme).toBe('dark');
    expect(html.getAttribute('data-theme')).toBe('dark');
  });

  it('takes an updater that receives the stored theme', () => {
    document.cookie = 'theme=dark';
    render(app());
    const updater = vi.fn((t: string) => (t === 'dark' ? 'light' : 'dark'));
    set(updater);
    expect(updater).toHaveBeenCalledWith('dark');
    expect(current.theme).toBe('light');
    set(updater);
    expect(current.theme).toBe('dark');
  });

  it('ignores names outside themes and value', () => {
    render(app({ value: { pink: 'my-pink' } }));
    set('dark');
    set('blue');
    expect(cookie('theme')).toBe('dark');
    set('pink');
    expect(current.theme).toBe('pink');
    expect(html.getAttribute('data-theme')).toBe('my-pink');
  });

  it('uses a custom and encoded storageKey', () => {
    render(app({ storageKey: 'my theme' }));
    set('dark');
    expect(cookie('my%20theme')).toBe('dark');
    expect(cookie('theme')).toBeUndefined();
  });

  it('writes the cookie with the core attributes', () => {
    const write = vi.spyOn(Document.prototype, 'cookie', 'set');
    render(app());
    set('dark');
    expect(write).toHaveBeenLastCalledWith('theme=dark; Path=/; Max-Age=34560000; SameSite=lax');
  });

  it('writes the cookie with the cookie prop attributes', () => {
    const write = vi.spyOn(Document.prototype, 'cookie', 'set');
    render(
      app({
        cookie: { domain: 'example.com', path: '/app', maxAge: 60, sameSite: 'none', secure: true, partitioned: true },
      }),
    );
    set('dark');
    expect(write).toHaveBeenLastCalledWith(
      'theme=dark; Path=/app; Domain=example.com; Max-Age=60; SameSite=none; Secure; Partitioned',
    );
  });

  it('keeps its store and effects across renders with a new but equal cookie literal', () => {
    render(app({ cookie: { sameSite: 'strict' } }));
    const first = current.setTheme;
    const paint = vi.spyOn(html, 'setAttribute');
    rerender(app({ cookie: { sameSite: 'strict' } }));
    expect(current.setTheme).toBe(first);
    expect(paint).not.toHaveBeenCalled();
    rerender(app({ cookie: { sameSite: 'none', secure: true } }));
    expect(current.setTheme).not.toBe(first);
    const write = vi.spyOn(Document.prototype, 'cookie', 'set');
    set('dark');
    expect(write).toHaveBeenLastCalledWith('theme=dark; Path=/; Max-Age=34560000; SameSite=none; Secure');
  });
});

describe('system theme', () => {
  it('resolves system and follows live prefers-color-scheme changes', () => {
    render(app({ attribute: 'class' }));
    expect(html.className).toBe('light');
    system.set(true);
    expect(html.className).toBe('dark');
    expect(html.style.colorScheme).toBe('dark');
    expect(current).toMatchObject({ theme: 'system', resolvedTheme: 'dark', systemTheme: 'dark' });
  });

  it('reports the OS preference but keeps an explicit theme', () => {
    document.cookie = 'theme=light';
    render(app());
    system.set(true);
    expect(html.getAttribute('data-theme')).toBe('light');
    expect(current).toMatchObject({ theme: 'light', resolvedTheme: 'light', systemTheme: 'dark' });
  });

  it('is off with enableSystem={false}', () => {
    system.set(true);
    render(app({ enableSystem: false }));
    expect(current).toMatchObject({ theme: 'light', resolvedTheme: 'light', systemTheme: undefined });
    expect(current.themes).toEqual(['light', 'dark']);
    set('system');
    expect(current.theme).toBe('light');
  });

  it('stops listening on unmount', () => {
    render(app());
    expect(system.listeners.size).toBeGreaterThan(0);
    act(() => root!.unmount());
    root = undefined;
    expect(system.listeners.size).toBe(0);
  });

  it('falls back to addListener where MediaQueryList has no addEventListener (Safari < 14)', () => {
    let dark = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return dark;
      },
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
    }));
    render(app({ attribute: 'class' }));
    expect(html.className).toBe('light');
    act(() => {
      dark = true;
      listeners.forEach((listener) => listener());
    });
    expect(html.className).toBe('dark');
    expect(current.systemTheme).toBe('dark');
    act(() => root!.unmount());
    root = undefined;
    expect(listeners.size).toBe(0);
  });

  it('works without matchMedia (jsdom without a mock)', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(app());
    expect(current.resolvedTheme).toBe('light');
  });
});

describe('props', () => {
  it('themes and defaultTheme', () => {
    render(app({ themes: ['a', 'b'], defaultTheme: 'b', enableSystem: false }));
    expect(current).toMatchObject({ theme: 'b', themes: ['a', 'b'] });
    expect(html.getAttribute('data-theme')).toBe('b');
    expect(html.style.colorScheme).toBe('');
  });

  it('forcedTheme wins on the page while the choice is kept', () => {
    document.cookie = 'theme=light';
    render(app({ forcedTheme: 'dark' }));
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(current).toMatchObject({ forcedTheme: 'dark', theme: 'light', resolvedTheme: 'light' });
    set('system'); // stored, as in next-themes, but not shown
    expect(cookie('theme')).toBe('system');
    expect(html.getAttribute('data-theme')).toBe('dark');
    rerender(app());
    expect(html.getAttribute('data-theme')).toBe('light');
  });

  it('value maps theme names to DOM values and swaps classes', () => {
    html.className = 'keep';
    render(app({ attribute: 'class', value: { light: 'is-light', dark: 'is-dark' } }));
    expect(html.className).toBe('keep is-light');
    set('dark');
    expect(html.className).toBe('keep is-dark');
    expect(current.theme).toBe('dark');
  });

  it('attribute takes a list of class and data-* targets', () => {
    render(app({ attribute: ['class', 'data-mode', 'data-theme'] }));
    set('dark');
    expect(html.className).toBe('dark');
    expect(html.getAttribute('data-mode')).toBe('dark');
    expect(html.getAttribute('data-theme')).toBe('dark');
  });

  it('enableColorScheme={false} leaves color-scheme alone', () => {
    render(app({ enableColorScheme: false }));
    set('dark');
    expect(html.style.colorScheme).toBe('');
  });

  it('color-scheme falls back to a light or dark defaultTheme for other themes', () => {
    render(app({ themes: ['light', 'dark', 'sepia'], defaultTheme: 'dark' }));
    set('sepia');
    expect(html.style.colorScheme).toBe('dark');
  });

  it('nonce and scriptProps go on the server script; type stays ours', () => {
    const div = document.createElement('div');
    div.innerHTML = ssr(app({ nonce: 'abc', scriptProps: { 'data-cfasync': 'false', type: 'module', id: 's' } }));
    const script = div.querySelector('script')!;
    expect(script.getAttribute('nonce')).toBe('abc');
    expect(script.getAttribute('type')).toBe('text/javascript');
    expect(script.getAttribute('data-cfasync')).toBe('false');
    expect(script.id).toBe('s');
  });

  it('nested providers pass their children through', () => {
    const container = render(
      <ThemeProvider attribute="class">
        <ThemeProvider attribute="data-x" storageKey="inner" themes={['x']}>
          <Probe />
        </ThemeProvider>
      </ThemeProvider>,
    );
    expect(container.querySelectorAll('script')).toHaveLength(1);
    expect(current.themes).toEqual(['light', 'dark', 'system']);
    set('dark');
    expect(cookie('theme')).toBe('dark');
    expect(html.className).toBe('dark');
    expect(html.hasAttribute('data-x')).toBe(false);
  });

  it('keeps its store across renders with new but equal array and object literals', () => {
    render(app({ themes: ['light', 'dark'], value: { dark: 'd' } }));
    const first = current.setTheme;
    rerender(app({ themes: ['light', 'dark'], value: { dark: 'd' } }));
    expect(current.setTheme).toBe(first);
    rerender(app({ themes: ['light', 'dark', 'sepia'], value: { dark: 'd' } }));
    expect(current.setTheme).not.toBe(first);
    expect(current.themes).toEqual(['light', 'dark', 'sepia', 'system']);
  });
});

describe('disableTransitionOnChange', () => {
  const styles = () => [...document.head.querySelectorAll('style')];
  const tick = () => act(() => new Promise((resolve) => setTimeout(resolve, 5)));

  it('disables transitions around a change with a style that carries the nonce', async () => {
    render(app({ disableTransitionOnChange: true, nonce: 'abc' }));
    await tick(); // the mount's own pause ends
    expect(styles()).toHaveLength(0);

    const append = vi.spyOn(document.head, 'appendChild');
    const write = vi.spyOn(html, 'setAttribute');
    const restyle = vi.spyOn(window, 'getComputedStyle');
    set('dark');

    expect(html.getAttribute('data-theme')).toBe('dark');
    const [style] = styles(); // still there: removed on the next tick
    expect(style!.getAttribute('nonce')).toBe('abc');
    expect(style!.textContent).toBe('*,*::before,*::after{transition:none!important}');
    // style first, then the theme, then a forced restyle while transitions are off
    const [added] = append.mock.invocationCallOrder;
    const written = write.mock.invocationCallOrder.at(-1)!;
    expect(added).toBeLessThan(written);
    expect(restyle).toHaveBeenCalledWith(html);
    expect(restyle.mock.invocationCallOrder[0]).toBeGreaterThan(written);
    await tick();
    expect(styles()).toHaveLength(0);
  });

  it('adds no style without the prop, and no nonce attribute without a nonce', () => {
    render(app());
    set('dark');
    expect(styles()).toHaveLength(0);
    act(() => root!.unmount());
    render(app({ disableTransitionOnChange: true }));
    expect(styles()[0]!.hasAttribute('nonce')).toBe(false);
  });
});

describe('next-themes migration', () => {
  it('moves a valid localStorage value to the cookie once', () => {
    localStorage.setItem('theme', 'dark');
    render(app());
    expect(cookie('theme')).toBe('dark');
    expect(current.theme).toBe('dark');
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBeNull();
    set('light');
    expect(cookie('theme')).toBe('light');
  });

  it('runs once: a stale value never comes back when the cookie goes away later', () => {
    localStorage.setItem('theme', 'dark');
    render(app());
    set('light'); // the user's newer choice
    act(() => root!.unmount());
    clearCookies(); // expiry, Safari's cap on script-written cookies, cleared cookies
    render(app());
    expect(current.theme).toBe('system');
    expect(document.cookie).toBe('');
  });

  it('keeps the value when the cookie write does not stick (cookies blocked)', () => {
    localStorage.setItem('theme', 'dark');
    vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation(() => {});
    render(app());
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('still migrates when removing the value throws', () => {
    localStorage.setItem('theme', 'dark');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    render(app());
    expect(cookie('theme')).toBe('dark');
    expect(current.theme).toBe('dark');
  });

  it('uses the storageKey for both', () => {
    localStorage.setItem('my-theme', 'dark');
    render(app({ storageKey: 'my-theme' }));
    expect(cookie('my-theme')).toBe('dark');
  });

  it('ignores and removes an invalid value', () => {
    localStorage.setItem('theme', 'blue');
    render(app());
    expect(document.cookie).toBe('');
    expect(current.theme).toBe('system');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('never overrides an existing cookie', () => {
    document.cookie = 'theme=light';
    localStorage.setItem('theme', 'dark');
    render(app());
    expect(current.theme).toBe('light');
  });

  it('survives storage that throws on read', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    render(app());
    expect(current.theme).toBe('system');
  });

  it('survives storage that throws on access', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      render(app());
      expect(current.theme).toBe('system');
    } finally {
      Object.defineProperty(globalThis, 'localStorage', desc);
    }
  });
});

describe('refresh against Safari’s 7-day cap on script-written cookies', () => {
  // Refreshed cookie names are remembered for the page load (the module), so every
  // test uses its own storageKey.
  const writes = () => vi.spyOn(Document.prototype, 'cookie', 'set');
  /** The provider in a Profiler: `commits` counts every render committed below it. */
  const profiled = (props: ThemeProviderProps) => {
    const commits = vi.fn();
    const node = (
      <StrictMode>
        <Profiler id="theme" onRender={commits}>
          {app(props)}
        </Profiler>
      </StrictMode>
    );
    return { node, commits };
  };

  it('re-writes an existing cookie once per page load, without a re-render', () => {
    const control = profiled({ storageKey: 'r0' }); // no cookie: nothing to refresh
    render(control.node);
    act(() => root!.unmount());
    document.cookie = 'r1=dark';
    const write = writes();
    const { node, commits } = profiled({ storageKey: 'r1' });
    render(node);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('r1=dark; Path=/; Max-Age=34560000; SameSite=lax');
    expect(current.theme).toBe('dark');
    expect(commits).toHaveBeenCalledTimes(control.commits.mock.calls.length);
    act(() => root!.unmount());
    render(profiled({ storageKey: 'r1', attribute: 'class' }).node); // same page load
    expect(write).toHaveBeenCalledTimes(1);
    set('light');
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('re-writes an existing cookie once after hydration, without errors', async () => {
    document.cookie = 'r2=dark';
    const node = <StrictMode>{app({ storageKey: 'r2' })}</StrictMode>;
    const markup = serve(node);
    const write = writes();
    const { errors, recoverable } = await hydrate(node, markup);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('r2=dark; Path=/; Max-Age=34560000; SameSite=lax');
    expect(current.theme).toBe('dark');
    expect(errors).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
  });

  it('re-writes only a cookie that lives longer than 7 days', () => {
    for (const name of ['r5', 'r6', 'r7']) document.cookie = name + '=dark';
    const write = writes();
    render(app({ storageKey: 'r5', cookie: { maxAge: 86400 } }));
    act(() => root!.unmount());
    render(app({ storageKey: 'r6', cookie: { maxAge: 604800 } }));
    act(() => root!.unmount());
    expect(write).not.toHaveBeenCalled();
    render(app({ storageKey: 'r7', cookie: { maxAge: 604801 } }));
    expect(write.mock.calls).toEqual([['r7=dark; Path=/; Max-Age=604801; SameSite=lax']]);
    expect(current.theme).toBe('dark');
  });

  it('leaves a theme this provider does not list alone until the user picks one', () => {
    // Another subdomain sharing the cookie (`cookie={{ domain }}`) lists `sepia`, or a
    // newer release did before a rollback: it reads as the default here.
    document.cookie = 'r8=sepia';
    const write = writes();
    render(app({ storageKey: 'r8', defaultTheme: 'light', enableSystem: false }));
    expect(write).not.toHaveBeenCalled();
    expect(document.cookie).toBe('r8=sepia');
    expect(current.theme).toBe('light');
    expect(html.getAttribute('data-theme')).toBe('light');
    set('dark');
    expect(document.cookie).toBe('r8=dark');
  });

  it('re-writes only a cookie that holds exactly the text it would write', () => {
    // Same theme in another spelling, or no valid theme at all: left as stored.
    const kept = ['r10="dark"', 'r11=%64ark', 'r12=%E0%A4%A', 'r13=', 'r14=__proto__', 'r15=high contrast'];
    for (const cookie of kept) document.cookie = cookie;
    document.cookie = 'r16=high%20contrast';
    const write = writes();
    for (const cookie of [...kept, 'r16']) {
      render(app({ storageKey: cookie.split('=')[0], themes: ['dark', 'high contrast'] }));
      act(() => root!.unmount());
    }
    expect(write.mock.calls).toEqual([['r16=high%20contrast; Path=/; Max-Age=34560000; SameSite=lax']]);
    for (const cookie of kept) expect(document.cookie).toContain(cookie);
  });

  it('never creates a missing cookie', () => {
    const write = writes();
    render(app({ storageKey: 'r3' }));
    expect(write).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
  });

  it('does not write on the server', () => {
    document.cookie = 'r4=dark';
    const write = writes();
    ssr(app({ storageKey: 'r4' }));
    expect(write).not.toHaveBeenCalled();
  });
});

describe('other tabs', () => {
  /** In-memory BroadcastChannel: delivers to every other open instance, synchronously. */
  const fakeChannels = () => {
    const open = new Set<FakeChannel>();
    class FakeChannel {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      constructor(readonly name: string) {
        open.add(this);
      }
      postMessage(data: unknown) {
        for (const c of open) if (c !== this && c.name === this.name) c.onmessage?.({ data });
      }
      close() {
        open.delete(this);
      }
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    return FakeChannel;
  };

  it('follows a change made in another tab through the core subscription', () => {
    const Channel = fakeChannels();
    render(app({ attribute: 'class' }));
    expect(html.className).toBe('light');
    act(() => {
      document.cookie = 'theme=dark'; // the other tab's write
      new Channel('cookie-prefs').postMessage(0);
    });
    expect(current.theme).toBe('dark');
    expect(html.className).toBe('dark');
  });

  it('re-reads the cookie when the tab becomes visible', () => {
    render(app({ attribute: 'class' }));
    document.cookie = 'theme=dark'; // changed without a notification (server Set-Cookie)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(html.className).toBe('light');
    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(html.className).toBe('dark');
    expect(current.theme).toBe('dark');
  });
});

describe('SSR and hydration', () => {
  it('renders undefined on the server and during hydration, then resolves, without warnings', async () => {
    system = mockSystem(true);
    document.cookie = 'theme=system';
    const node = app({ attribute: 'class', nonce: 'abc' });
    const markup = serve(node);
    expect(markup).toContain('<p>undefined undefined</p>');
    expect(html.className).toBe('dark'); // before hydration, from the script
    renders = [];
    const { container, errors, recoverable } = await hydrate(node, markup);
    expect(renders[0]).toEqual([undefined, undefined, undefined]);
    expect(renders.at(-1)).toEqual(['system', 'dark', 'dark']);
    expect(container.querySelector('p')!.textContent).toBe('system dark');
    expect(errors).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    expect(html.className).toBe('dark');
    // the server element keeps its nonce
    expect(container.querySelector('script')!.getAttribute('nonce')).toBe('abc');
  });

  it('keeps a mounted guard working', async () => {
    const Toggle = () => {
      const { resolvedTheme } = useTheme();
      return <button>{resolvedTheme ?? 'loading'}</button>;
    };
    document.cookie = 'theme=dark';
    const node = (
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>
    );
    const markup = serve(node);
    expect(markup).toContain('<button>loading</button>');
    const { container, errors } = await hydrate(node, markup);
    expect(container.querySelector('button')!.textContent).toBe('dark');
    expect(errors).not.toHaveBeenCalled();
  });

  it('re-applies on mount after React reset <html> (Strict Mode remount)', async () => {
    document.cookie = 'theme=dark';
    const node = <StrictMode>{app({ attribute: ['class', 'data-theme'] })}</StrictMode>;
    const markup = serve(node);
    wipeHtml();
    const { errors } = await hydrate(node, markup);
    expect(html.className).toBe('dark');
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(errors).not.toHaveBeenCalled();
  });

  it('applies on a client-only mount in Strict Mode', () => {
    document.cookie = 'theme=dark';
    render(<StrictMode>{app()}</StrictMode>);
    expect(html.getAttribute('data-theme')).toBe('dark');
  });
});

describe('next-themes regressions', () => {
  it('#385 / #387: a client-rendered provider does not warn about its script', () => {
    const errors = vi.spyOn(console, 'error');
    const container = render(app({ nonce: 'abc' }));
    const script = container.querySelector('script')!;
    expect(script.getAttribute('type')).toBe('text/plain');
    expect(script.hasAttribute('nonce')).toBe(false);
    expect(errors).not.toHaveBeenCalled();
  });

  // React 19 added the "Encountered a script tag" warning; React 18 never emits it.
  it.skipIf(Number(version.split('.')[0]) < 19)('a plain client-rendered script does warn (control)', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<script dangerouslySetInnerHTML={{ __html: '1' }} />);
    expect(errors.mock.calls.flat().join()).toContain('Encountered a script tag');
  });

  // <Activity> exists from React 19.2; the scenario cannot happen on React 18.
  const Activity = (React as unknown as Record<string, unknown>).Activity as
    | ComponentType<{ mode: 'visible' | 'hidden'; children?: ReactNode }>
    | undefined;

  it.skipIf(!Activity)('#375: a provider revealed by <Activity> never brings back a stale theme', () => {
    const Act = Activity!;
    const hooks: Record<string, UseThemeProps> = {};
    const Page = ({ id }: { id: string }) => {
      hooks[id] = useTheme();
      return null;
    };
    // One provider per locale layout, kept alive while hidden (Cache Components). The
    // cached segments are the same elements, so a reveal re-runs effects without
    // re-rendering the provider: whatever it held in state would be applied again.
    const trees: Record<string, ReactNode> = {};
    for (const id of ['en', 'es'])
      trees[id] = (
        <ThemeProvider attribute="class">
          <Page id={id} />
        </ThemeProvider>
      );
    const App = ({ page }: { page: string }) => (
      <>
        {['en', 'es'].map((id) => (
          <Act key={id} mode={page == id ? 'visible' : 'hidden'}>
            {trees[id]}
          </Act>
        ))}
      </>
    );
    render(<App page="en" />);
    act(() => hooks.en!.setTheme('dark'));
    expect(html.className).toBe('dark');
    rerender(<App page="es" />);
    act(() => hooks.es!.setTheme('light'));
    expect(html.className).toBe('light');

    const add = vi.spyOn(DOMTokenList.prototype, 'add');
    rerender(<App page="en" />);
    expect(add).not.toHaveBeenCalledWith('dark'); // not even briefly
    expect(html.className).toBe('light');
    expect(hooks.en!.theme).toBe('light');
    expect(cookie('theme')).toBe('light');
  });

  describe('under enforced Trusted Types', () => {
    let restore = () => {};
    afterEach(() => restore());

    it('hydrates, re-applies and switches without creating or running a script', async () => {
      document.cookie = 'theme=dark';
      const node = app({ attribute: 'class', nonce: 'abc' });
      const markup = serve(node);
      restore = blockScriptText();
      // control: the stub really blocks script text
      for (const key of ['text', 'textContent', 'innerHTML'] as const)
        expect(() => (document.createElement('script')[key] = '1')).toThrow(/TrustedScript/);
      wipeHtml();
      const create = vi.spyOn(document, 'createElement');
      const evaluate = vi.spyOn(globalThis, 'Function');
      const { errors, recoverable } = await hydrate(node, markup);
      expect(html.className).toBe('dark');
      set('light');
      expect(html.className).toBe('light');
      expect(create).not.toHaveBeenCalledWith('script');
      expect(evaluate).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      expect(recoverable).not.toHaveBeenCalled();
    });

    it('keeps the first script text when props change after hydration (forcedTheme per route)', async () => {
      document.cookie = 'theme=light';
      const node = (forcedTheme?: string) => app({ attribute: 'class', forcedTheme });
      const markup = serve(node());
      restore = blockScriptText();
      const { container, errors, recoverable } = await hydrate(node(), markup);
      const text = container.querySelector('script')!.textContent;
      rerender(node('dark')); // navigate to a page with a forced theme
      expect(html.className).toBe('dark');
      expect(current.forcedTheme).toBe('dark');
      rerender(node());
      expect(html.className).toBe('light');
      expect(container.querySelector('script')!.textContent).toBe(text);
      expect(errors).not.toHaveBeenCalled();
      expect(recoverable).not.toHaveBeenCalled();
    });

    it('hands React the same __html object on every render, so no React version re-writes the script', async () => {
      document.cookie = 'theme=dark';
      const node = (forcedTheme?: string) => app({ attribute: 'class', forcedTheme });
      const markup = serve(node());
      const block = blockScriptText();
      const record = recordScriptHtml();
      restore = () => {
        record.restore();
        block();
      };
      const { errors, recoverable } = await hydrate(node(), markup);
      rerender(node('light'));
      set('light');
      // hydration, the re-render with the client snapshot, the prop change, the setter; React 18 stores props only at hydration and on a commit that
      // changed something, so it records fewer
      expect(record.values.length).toBeGreaterThanOrEqual(Number(version.split('.')[0]) < 19 ? 1 : 4);
      expect(new Set(record.values).size).toBe(1);
      expect(errors).not.toHaveBeenCalled();
      expect(recoverable).not.toHaveBeenCalled();
    });
  });
});
