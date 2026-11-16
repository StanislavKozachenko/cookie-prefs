import { act, StrictMode, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { definePrefs, pref, snapshotPrefs, type Pref } from '../index';
import { PrefsProvider, usePref } from './index';

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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const make = () =>
  definePrefs({
    theme: pref.enum(['light', 'dark', 'system']).default('system'),
    pageSize: pref.number().default(25),
    locale: pref.string(),
    columns: pref.json(z.array(z.string())).default([]),
    since: pref.custom({ parse: (raw) => ({ raw }), serialize: (v: { raw: string }) => v.raw }),
  });

/** Render on the client into a fresh container. */
const render = (node: ReactNode) => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
};

/** Render on the server (no `document`, like Node) and return the text. */
const ssr = (node: ReactNode) => {
  vi.stubGlobal('document', undefined);
  let html: string;
  try {
    html = renderToString(node);
  } finally {
    vi.unstubAllGlobals();
  }
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent;
};

/** Exposes the hook's tuple to the test. */
const probe = <T, V>(handle: Pref<T, V>) => {
  const seen: { value: V; set: (value: T | ((prev: V) => T)) => void }[] = [];
  const Probe = () => {
    const [value, set] = usePref(handle);
    seen.push({ value, set });
    return <>{JSON.stringify(value) ?? 'undefined'}</>;
  };
  return { Probe, seen, last: () => seen[seen.length - 1]! };
};

describe('usePref on the client', () => {
  it('reads the initial value from the cookie', () => {
    const prefs = make();
    document.cookie = 'theme=dark';
    document.cookie = 'columns=%5B%22a%22%5D';
    const theme = probe(prefs.theme);
    const columns = probe(prefs.columns);
    const el = render(
      <>
        <theme.Probe />
        <columns.Probe />
      </>,
    );
    expect(el.textContent).toBe('"dark"["a"]');
  });

  it('returns the handle’s own setter', () => {
    const prefs = make();
    const { Probe, last } = probe(prefs.theme);
    render(<Probe />);
    expect(last().set).toBe(prefs.theme.set);
  });

  it('updates on set, updater and reset', () => {
    const prefs = make();
    const { Probe, last } = probe(prefs.pageSize);
    const el = render(<Probe />);
    expect(el.textContent).toBe('25');
    act(() => last().set(50));
    expect(el.textContent).toBe('50');
    act(() => last().set((n) => n + 1));
    expect(el.textContent).toBe('51');
    act(() => prefs.pageSize.reset());
    expect(el.textContent).toBe('25');
  });

  it('updates every component using the same pref', () => {
    const prefs = make();
    const a = probe(prefs.locale);
    const b = probe(prefs.locale);
    const el = render(
      <>
        <a.Probe />|<b.Probe />
      </>,
    );
    expect(el.textContent).toBe('undefined|undefined');
    act(() => a.last().set('de'));
    expect(el.textContent).toBe('"de"|"de"');
  });

  it('follows a change made in another tab', () => {
    const store = new EventTarget();
    vi.stubGlobal('cookieStore', store);
    const prefs = make();
    const { Probe } = probe(prefs.theme);
    const el = render(<Probe />);
    act(() => {
      document.cookie = 'theme=light'; // the other tab's write lands in the shared jar
      store.dispatchEvent(new Event('change'));
    });
    expect(el.textContent).toBe('"light"');
  });

  it('keeps json and custom values referentially stable', () => {
    const prefs = make();
    document.cookie = 'columns=%5B%22a%22%5D';
    document.cookie = 'since=x';
    const columns = probe(prefs.columns);
    const since = probe(prefs.since);
    let bump: () => void = () => {};
    const App = () => {
      const [n, setN] = useState(0);
      bump = () => setN(n + 1);
      return (
        <>
          <columns.Probe />
          <since.Probe />
          {n}
        </>
      );
    };
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    const renders = columns.seen.length;
    const first = columns.last().value;
    // Rewriting the same value does not re-render.
    act(() => prefs.columns.set(['a']));
    act(() => prefs.since.set({ raw: 'x' }));
    expect(columns.seen.length).toBe(renders);
    // A parent re-render gets the very same objects.
    act(() => bump());
    expect(columns.seen.length).toBeGreaterThan(renders);
    expect(columns.seen.every(({ value }) => value === first)).toBe(true);
    expect(new Set(since.seen.map(({ value }) => value)).size).toBe(1);
  });

  it('unsubscribes on unmount', () => {
    const prefs = make();
    const off = vi.fn();
    const handle: typeof prefs.theme = {
      ...prefs.theme,
      subscribe: (listener) => {
        const unsubscribe = prefs.theme.subscribe(listener);
        return () => {
          off();
          unsubscribe();
        };
      },
    };
    const { Probe, seen } = probe(handle);
    render(<Probe />);
    expect(off).not.toHaveBeenCalled();
    act(() => root!.unmount());
    root = undefined;
    expect(off).toHaveBeenCalledTimes(1);
    const renders = seen.length;
    prefs.theme.set('dark');
    expect(seen.length).toBe(renders);
  });
});

describe('usePref on the server', () => {
  it('renders the default without a provider and never reads document.cookie', () => {
    const prefs = make();
    const warn = vi.spyOn(console, 'warn');
    const { Probe } = probe(prefs.theme);
    const columns = probe(prefs.columns);
    expect(
      ssr(
        <>
          <Probe />|<columns.Probe />
        </>,
      ),
    ).toBe('"system"|[]');
    expect(warn).not.toHaveBeenCalled();
  });

  it('renders the default under a provider without a snapshot', () => {
    const prefs = make();
    const { Probe } = probe(prefs.theme);
    expect(
      ssr(
        <PrefsProvider>
          <Probe />
        </PrefsProvider>,
      ),
    ).toBe('"system"');
  });

  it('renders the snapshot value under a provider', () => {
    const prefs = make();
    const snapshot = snapshotPrefs(prefs, 'theme=dark; columns=%5B%22a%22%5D; other=1');
    const theme = probe(prefs.theme);
    const columns = probe(prefs.columns);
    expect(
      ssr(
        <PrefsProvider snapshot={snapshot}>
          <theme.Probe />|<columns.Probe />
        </PrefsProvider>,
      ),
    ).toBe('"dark"|["a"]');
  });

  it('merges the snapshots of nested providers', () => {
    const prefs = make();
    const theme = probe(prefs.theme);
    const locale = probe(prefs.locale);
    expect(
      ssr(
        <PrefsProvider snapshot={{ theme: 'dark' }}>
          <PrefsProvider snapshot={{ locale: 'de' }}>
            <theme.Probe />|<locale.Probe />
          </PrefsProvider>
          <PrefsProvider>
            |<theme.Probe />
          </PrefsProvider>
        </PrefsProvider>,
      ),
    ).toBe('"dark"|"de"|"dark"');
  });
});
