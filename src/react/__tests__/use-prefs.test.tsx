// @vitest-environment jsdom
import { act, StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { definePrefs, pref, snapshotPrefs, type PrefsRecord, type PrefValues } from '../../index';
import { prefsScript } from '../../script/index';
import { PrefsProvider, usePrefs, type PrefsSetter } from '../index';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const clearCookies = () => {
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
};

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  clearCookies();
  for (const { name } of [...document.documentElement.attributes]) document.documentElement.removeAttribute(name);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const make = () =>
  definePrefs({
    theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class'),
    sidebar: pref.boolean().default(true).reflect('data-sidebar'),
    pageSize: pref.number().default(25),
    locale: pref.string(),
    columns: pref.json(z.array(z.string())).default([]),
  });

const render = (node: ReactNode) => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
};

/** Render on the server (no `document`, like Node) and return the markup. */
const ssr = (node: ReactNode) => {
  vi.stubGlobal('document', undefined);
  try {
    return renderToString(node);
  } finally {
    vi.unstubAllGlobals();
  }
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

/** Exposes every render's tuple to the test. */
const probe = <P extends PrefsRecord>(record: () => P) => {
  const seen: { values: PrefValues<P>; set: PrefsSetter<P> }[] = [];
  const Probe = () => {
    const [values, set] = usePrefs(record());
    seen.push({ values, set });
    return <p>{JSON.stringify(values)}</p>;
  };
  return { Probe, seen, last: () => seen[seen.length - 1]! };
};

const defaults = { theme: 'system', sidebar: true, pageSize: 25, columns: [] };

describe('usePrefs on the client', () => {
  it('reads every pref of the record from the cookie, typed like readPrefs', () => {
    const prefs = make();
    document.cookie = 'theme=dark';
    document.cookie = 'locale=de';
    document.cookie = 'columns=%5B%22a%22%5D';
    const { Probe, last } = probe(() => prefs);
    render(<Probe />);
    expect(last().values).toEqual({ theme: 'dark', sidebar: true, pageSize: 25, locale: 'de', columns: ['a'] });
    expect(Object.keys(last().values)).toEqual(['theme', 'sidebar', 'pageSize', 'locale', 'columns']);
  });

  it('re-renders once per change and returns a new object only then', () => {
    const prefs = make();
    const { Probe, seen, last } = probe(() => prefs);
    let bump = () => {};
    const App = () => {
      const [n, setN] = useState(0);
      bump = () => setN(n + 1);
      return (
        <>
          <Probe />
          {n}
        </>
      );
    };
    render(<App />);
    expect(seen).toHaveLength(1);
    const first = last();

    // A parent re-render, a write of the same value and a pref outside the record keep both.
    act(() => bump());
    act(() => prefs.theme.set('system'));
    act(() => definePrefs({ other: pref.string() }).other.set('x'));
    expect(seen).toHaveLength(2);
    expect(last().values).toBe(first.values);
    expect(last().set).toBe(first.set);

    act(() => prefs.theme.set('dark'));
    expect(seen).toHaveLength(3);
    expect(last().values).not.toBe(first.values);
    expect(last().values).toEqual({ ...defaults, theme: 'dark' });
    expect(last().set).toBe(first.set);

    // One patch of several prefs is one re-render.
    act(() => last().set({ theme: 'light', sidebar: false, pageSize: 50 }));
    expect(seen).toHaveLength(4);
    expect(last().values).toEqual({ ...defaults, theme: 'light', sidebar: false, pageSize: 50 });

    // Writes outside an event handler are batched too.
    const values = last().values;
    act(() => {
      prefs.locale.set('de');
      prefs.columns.set(['a']);
    });
    expect(seen).toHaveLength(5);
    expect(last().values).not.toBe(values);
    expect(last().values.columns).toBe(prefs.columns.get());
  });

  it('keeps json values referentially stable', () => {
    const prefs = make();
    document.cookie = 'columns=%5B%22a%22%5D';
    const { Probe, seen, last } = probe(() => prefs);
    render(<Probe />);
    const columns = last().values.columns;
    act(() => last().set({ columns: ['a'] }));
    expect(seen).toHaveLength(1);
    expect(last().values.columns).toBe(columns);
  });

  it('is safe as an effect dependency', () => {
    const prefs = make();
    const runs = vi.fn();
    let bump = () => {};
    const App = () => {
      const [values] = usePrefs(prefs);
      const [n, setN] = useState(0);
      bump = () => setN(n + 1);
      useEffect(() => runs(values), [values]);
      return <>{n}</>;
    };
    render(<App />);
    act(() => bump());
    act(() => bump());
    expect(runs).toHaveBeenCalledTimes(1);
    act(() => prefs.sidebar.set(false));
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('writes a partial patch: values and updaters, each like that pref’s set()', () => {
    const prefs = make();
    document.cookie = 'pageSize=30';
    const sets = Object.fromEntries(Object.entries(prefs).map(([key, p]) => [key, vi.spyOn(p, 'set')]));
    const { Probe, last } = probe(() => prefs);
    const el = render(<Probe />);
    for (const spy of Object.values(sets)) spy.mockClear(); // the Safari refresh of pageSize
    act(() =>
      last().set({
        sidebar: (open) => !open,
        pageSize: (n) => n * 2,
        locale: 'de AT',
        columns: (prev) => [...prev, 'b'],
      }),
    );
    expect(last().values).toEqual({ theme: 'system', sidebar: false, pageSize: 60, locale: 'de AT', columns: ['b'] });
    expect(el.textContent).toBe(JSON.stringify(last().values));
    expect(document.cookie).toBe('pageSize=60; sidebar=false; locale=de%20AT; columns=%5B%22b%22%5D');
    // Only the patched keys, each through its own `set()`, in the patch's order.
    expect(sets.theme).not.toHaveBeenCalled();
    expect(sets.sidebar).toHaveBeenCalledTimes(1);
    const order = (['sidebar', 'pageSize', 'locale', 'columns'] as const).map(
      (key) => sets[key]!.mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a! - b!));
  });

  it('skips undefined entries and an empty patch; reset() clears', () => {
    const prefs = make();
    document.cookie = 'theme=dark';
    document.cookie = 'locale=de';
    const write = vi.spyOn(Document.prototype, 'cookie', 'set');
    const { Probe, seen, last } = probe(() => prefs);
    render(<Probe />);
    write.mockClear(); // the Safari refresh of the existing cookies
    const renders = seen.length;
    act(() => last().set({}));
    act(() => last().set({ theme: undefined, locale: undefined } as never));
    expect(write).not.toHaveBeenCalled();
    expect(seen).toHaveLength(renders);
    expect(last().values).toMatchObject({ theme: 'dark', locale: 'de' });
    act(() => prefs.locale.reset());
    expect(last().values.locale).toBeUndefined();
  });

  it('follows a change made in another tab', () => {
    const store = new EventTarget();
    vi.stubGlobal('cookieStore', store);
    const prefs = make();
    const { Probe, seen, last } = probe(() => prefs);
    render(<Probe />);
    act(() => {
      document.cookie = 'theme=light'; // the other tab's write lands in the shared jar
      document.cookie = 'sidebar=false';
      store.dispatchEvent(new Event('change'));
    });
    expect(last().values).toEqual({ ...defaults, theme: 'light', sidebar: false });
    expect(seen).toHaveLength(2);
    expect(document.documentElement.className).toBe('light');
  });

  it('takes a sub-record of handles, also a new object on every render', () => {
    const prefs = make();
    document.cookie = 'theme=dark';
    const subscribe = vi.spyOn(prefs.theme, 'subscribe');
    const { Probe, seen, last } = probe(() => ({ theme: prefs.theme, locale: prefs.locale }));
    let bump = () => {};
    const App = () => {
      const [n, setN] = useState(0);
      bump = () => setN(n + 1);
      return (
        <>
          <Probe />
          {n}
        </>
      );
    };
    const el = render(<App />);
    expect(el.textContent).toBe('{"theme":"dark"}0');
    act(() => bump());
    expect(seen).toHaveLength(2);
    expect(seen[1]!.values).toBe(seen[0]!.values);
    expect(seen[1]!.set).toBe(seen[0]!.set);
    expect(subscribe).toHaveBeenCalledTimes(1); // no resubscription on re-render
    act(() => last().set({ locale: 'fr' }));
    expect(last().values).toEqual({ theme: 'dark', locale: 'fr' });
    // Other prefs of the full record do not re-render it.
    const renders = seen.length;
    act(() => prefs.sidebar.set(false));
    expect(seen).toHaveLength(renders);
  });

  it('gives a new setter for other handles under the same keys', () => {
    const a = make();
    const b = make();
    let record: PrefsRecord = { theme: a.theme };
    const { Probe, seen, last } = probe(() => record);
    let bump = () => {};
    const App = () => {
      const [n, setN] = useState(0);
      bump = () => setN(n + 1);
      return <Probe key="p" />;
    };
    render(<App />);
    const first = last().set;
    record = { mode: a.theme };
    act(() => bump());
    expect(Object.keys(last().values)).toEqual(['mode']);
    expect(last().set).not.toBe(first);
    record = { mode: b.theme };
    const second = last().set;
    act(() => bump());
    expect(last().set).not.toBe(second);
    expect(seen.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps a pref keyed __proto__ as an own key', () => {
    const prefs = definePrefs({ ['__proto__']: pref.string().default('x') });
    const { Probe, last } = probe(() => prefs);
    render(<Probe />);
    expect(Object.keys(last().values)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(last().values)).toBe(Object.prototype);
    act(() => last().set(JSON.parse('{"__proto__":"y"}')));
    expect(Object.getOwnPropertyDescriptor(last().values, '__proto__')?.value).toBe('y');
  });

  it('works in Strict Mode and refreshes existing cookies once, like usePref', () => {
    const prefs = make();
    document.cookie = 'theme=dark';
    const write = vi.spyOn(Document.prototype, 'cookie', 'set');
    const { Probe, last } = probe(() => prefs);
    const el = render(
      <StrictMode>
        <Probe />
        <Probe />
      </StrictMode>,
    );
    expect(write.mock.calls).toEqual([['theme=dark; Path=/; Max-Age=34560000; SameSite=lax']]);
    act(() => last().set({ theme: 'light' }));
    expect(el.textContent).toBe(JSON.stringify({ ...defaults, theme: 'light' }).repeat(2));
  });

  it('unsubscribes on unmount', () => {
    const prefs = make();
    const { Probe, seen } = probe(() => prefs);
    render(<Probe />);
    act(() => root!.unmount());
    root = undefined;
    const renders = seen.length;
    prefs.theme.set('dark');
    expect(seen).toHaveLength(renders);
  });
});

describe('usePrefs on the server and during hydration', () => {
  it('renders the defaults without a provider and writes nothing', () => {
    const prefs = make();
    document.cookie = 'theme=dark';
    const warn = vi.spyOn(console, 'warn');
    const { Probe, last } = probe(() => prefs);
    expect(ssr(<Probe />)).toBe(`<p>${JSON.stringify(defaults).replace(/"/g, '&quot;')}</p>`);
    expect(last().values).toEqual(defaults);
    vi.stubGlobal('document', undefined);
    try {
      expect(() => last().set({ theme: 'light' })).not.toThrow(); // a no-op, like set()
    } finally {
      vi.unstubAllGlobals();
    }
    expect(document.cookie).toBe('theme=dark');
    expect(warn).not.toHaveBeenCalled();
  });

  it('hydrates the snapshot without a mismatch, then follows the cookie', async () => {
    const prefs = make();
    document.cookie = 'theme=dark';
    document.cookie = 'sidebar=false';
    document.cookie = 'columns=%5B%22a%22%5D';
    const snapshot = snapshotPrefs(prefs, document.cookie);
    const { Probe, last } = probe(() => prefs);
    const node = (
      <PrefsProvider snapshot={snapshot} script={prefsScript(prefs)}>
        <Probe />
      </PrefsProvider>
    );
    const markup = ssr(node);
    const expected = { ...defaults, theme: 'dark', sidebar: false, columns: ['a'] };
    expect(markup).toContain(JSON.stringify(expected).replace(/"/g, '&quot;'));
    const { container, errors, recoverable } = await hydrate(node, markup);
    expect(errors).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('p')!.textContent).toBe(JSON.stringify(expected));
    act(() => last().set({ theme: 'light', sidebar: true }));
    expect(container.querySelector('p')!.textContent).toBe(JSON.stringify({ ...expected, theme: 'light', sidebar: true }));
    expect(document.cookie).toContain('theme=light');
  });

  it('hydrates defaults without a snapshot, then reads the cookie (script mode)', async () => {
    const prefs = make();
    document.cookie = 'theme=dark';
    const { Probe } = probe(() => prefs);
    const node = (
      <PrefsProvider script={prefsScript(prefs)}>
        <Probe />
      </PrefsProvider>
    );
    const markup = ssr(node);
    expect(markup).toContain(JSON.stringify(defaults).replace(/"/g, '&quot;'));
    const { container, errors, recoverable } = await hydrate(node, markup);
    expect(errors).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('p')!.textContent).toBe(JSON.stringify({ ...defaults, theme: 'dark' }));
  });

  it('hydrates outside a provider like usePref', async () => {
    const prefs = make();
    document.cookie = 'pageSize=50';
    const { Probe } = probe(() => prefs);
    const { container, errors, recoverable } = await hydrate(
      <StrictMode>
        <Probe />
      </StrictMode>,
      ssr(<Probe />),
    );
    expect(errors).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.textContent).toBe(JSON.stringify({ ...defaults, pageSize: 50 }));
  });
});
