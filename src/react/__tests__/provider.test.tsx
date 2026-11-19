import { act, StrictMode, version, type ReactNode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { definePrefs, pref, snapshotPrefs, type PrefsRecord } from '../../index';
import { prefsScript } from '../../script/index';
import { PrefsProvider, usePref, type PrefsProviderProps } from '../index';

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

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  clearCookies();
  wipeHtml();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const make = () =>
  definePrefs({
    theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class'),
    sidebar: pref.boolean().default(true).reflect('data-sidebar'),
    columns: pref.json(z.array(z.string())).default([]),
  });

type TestPrefs = ReturnType<typeof make>;

const Show = ({ prefs }: { prefs: TestPrefs }) => {
  const [theme] = usePref(prefs.theme);
  const [sidebar] = usePref(prefs.sidebar);
  const [columns] = usePref(prefs.columns);
  return <p>{`${theme} ${sidebar} ${columns.join()}`}</p>;
};

const app = (prefs: TestPrefs, props: PrefsProviderProps = {}) => (
  <PrefsProvider script={prefsScript(prefs)} {...props}>
    <Show prefs={prefs} />
  </PrefsProvider>
);

/** Render on the server: no `document`, like Node. */
const ssr = (node: ReactNode) => {
  vi.stubGlobal('document', undefined);
  try {
    return renderToString(node);
  } finally {
    vi.unstubAllGlobals();
  }
};

/** Run a server-rendered inline script the way the browser does while parsing. */
const runServerScript = (container: Element) =>
  new Function(container.querySelector('script')!.textContent!)();

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

const render = (node: ReactNode) => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
};

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

describe('hydration', () => {
  it('matches the server when the cookie is set (server mode)', async () => {
    const prefs = make();
    document.cookie = 'theme=dark';
    document.cookie = 'sidebar=false';
    document.cookie = 'columns=%5B%22a%22%2C%22b%22%5D';
    const node = app(prefs, { snapshot: snapshotPrefs(prefs, document.cookie), nonce: 'abc' });
    const markup = ssr(node);
    const { container, errors, recoverable } = await hydrate(node, markup);
    expect(errors).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('p')!.textContent).toBe('dark false a,b');
  });

  it('matches the server when the cookie is absent (server mode)', async () => {
    const prefs = make();
    const node = app(prefs, { snapshot: snapshotPrefs(prefs, document.cookie), nonce: 'abc' });
    const { container, errors, recoverable } = await hydrate(node, ssr(node));
    expect(errors).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('p')!.textContent).toBe('system true ');
  });

  it('renders defaults, then the cookie, without warnings (script mode)', async () => {
    const prefs = make();
    document.cookie = 'theme=dark';
    const node = app(prefs);
    const markup = ssr(node);
    expect(markup).toContain('system true');
    const { container, errors, recoverable } = await hydrate(node, markup);
    expect(errors).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('p')!.textContent).toBe('dark true ');
  });

  it('reports a real mismatch (control: the spies see hydration errors)', async () => {
    const prefs = make();
    const markup = ssr(app(prefs, { snapshot: { theme: 'dark' } }));
    const { recoverable, errors } = await hydrate(app(prefs, { snapshot: { theme: 'light' } }), markup);
    expect(recoverable.mock.calls.length + errors.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('inline script', () => {
  it('is rendered on the server as an executable script with the nonce', () => {
    const prefs = make();
    const div = document.createElement('div');
    div.innerHTML = ssr(app(prefs, { nonce: 'abc' }));
    const script = div.firstElementChild as HTMLScriptElement;
    expect(script.tagName).toBe('SCRIPT');
    expect(script.getAttribute('type')).toBe('text/javascript');
    expect(script.getAttribute('nonce')).toBe('abc');
    expect(script.textContent).toBe(prefsScript(prefs));
  });

  it('is not rendered without a script', () => {
    const prefs = make();
    expect(ssr(<PrefsProvider nonce="abc">x</PrefsProvider>)).toBe('x');
    expect(ssr(<PrefsProvider script="">x</PrefsProvider>)).toBe('x');
    const container = render(<PrefsProvider>{prefs.theme.key}</PrefsProvider>);
    expect(container.querySelector('script')).toBeNull();
    expect(html.attributes).toHaveLength(0);
  });

  it('is an inert data block when rendered on the client, without the script warning', () => {
    const prefs = make();
    const errors = vi.spyOn(console, 'error');
    const container = render(app(prefs, { nonce: 'abc' }));
    const script = container.querySelector('script')!;
    expect(script.getAttribute('type')).toBe('text/plain');
    expect(script.hasAttribute('nonce')).toBe(false);
    expect(errors).not.toHaveBeenCalled();
  });

  // React 19 added the "Encountered a script tag" warning; React 18 never emits it.
  it.skipIf(Number(version.split('.')[0]) < 19)('a plain client-rendered script does warn (control for the test above)', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<script dangerouslySetInnerHTML={{ __html: '1' }} />);
    expect(errors.mock.calls.flat().join()).toContain('Encountered a script tag');
  });
});

describe('reflection on <html>', () => {
  // No hooks below the provider here: a subscribed pref reflects itself, which would
  // hide whether the provider re-applies the script.
  const bare = (prefs: PrefsRecord, props: PrefsProviderProps = {}) => (
    <PrefsProvider script={prefsScript(prefs)} {...props}>
      content
    </PrefsProvider>
  );

  it('is re-applied on mount after the attributes were wiped', async () => {
    const prefs = make();
    document.cookie = 'theme=dark';
    document.cookie = 'sidebar=false';
    const node = bare(prefs, { nonce: 'abc' });
    const container = document.createElement('div');
    container.innerHTML = ssr(node);
    runServerScript(container);
    expect(html.className).toBe('dark');
    wipeHtml();
    const { errors } = await hydrate(node, container.innerHTML);
    expect(html.className).toBe('dark');
    expect(html.getAttribute('data-sidebar')).toBe('false');
    expect(errors).not.toHaveBeenCalled();
  });

  it('is applied on a client-only mount, also in Strict Mode', () => {
    const prefs = make();
    document.cookie = 'sidebar=false';
    render(<StrictMode>{bare(prefs)}</StrictMode>);
    expect(html.className).toBe('system');
    expect(html.getAttribute('data-sidebar')).toBe('false');
  });

  it('follows other tabs when the tab becomes visible again', () => {
    render(bare(make()));
    expect(html.getAttribute('data-sidebar')).toBe('true');

    document.cookie = 'sidebar=false'; // another tab, nobody here subscribes
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(html.getAttribute('data-sidebar')).toBe('true');

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(html.getAttribute('data-sidebar')).toBe('false');

    act(() => root!.unmount());
    root = undefined;
    document.cookie = 'sidebar=true';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(html.getAttribute('data-sidebar')).toBe('false');
  });

  it('and the hooks agree after a change nothing announced, once the tab is visible', () => {
    // No CookieStore: a server `Set-Cookie` or a tab on a sibling subdomain fires nothing
    const prefs = make();
    render(app(prefs));
    expect(document.querySelector('p')!.textContent).toBe('system true ');
    document.cookie = 'theme=dark';
    document.cookie = 'sidebar=false';
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(html.className).toBe('dark');
    expect(html.getAttribute('data-sidebar')).toBe('false');
    expect(document.querySelector('p')!.textContent).toBe('dark false ');
  });

  describe('under enforced Trusted Types', () => {
    let restore = () => {};
    afterEach(() => restore());

    /** Server render, run the pre-paint script, then block script text like Trusted Types. */
    const serve = (node: ReactNode) => {
      const container = document.createElement('div');
      container.innerHTML = ssr(node);
      runServerScript(container);
      restore = blockScriptText();
      // control: the stub really blocks script text
      for (const key of ['text', 'textContent', 'innerHTML'] as const)
        expect(() => (document.createElement('script')[key] = '1')).toThrow(/TrustedScript/);
      return container.innerHTML;
    };

    it('is re-applied on mount after the attributes were wiped, without a script', async () => {
      const prefs = make();
      document.cookie = 'theme=dark';
      document.cookie = 'sidebar=false';
      const node = bare(prefs, { nonce: 'abc' });
      const markup = serve(node);
      wipeHtml();
      const create = vi.spyOn(document, 'createElement');
      const { errors, recoverable } = await hydrate(node, markup);
      expect(html.className).toBe('dark');
      expect(html.getAttribute('data-sidebar')).toBe('false');
      expect(create).not.toHaveBeenCalledWith('script');
      expect(errors).not.toHaveBeenCalled();
      expect(recoverable).not.toHaveBeenCalled();
    });

    it('keeps the first script text when the script changes after hydration', async () => {
      const prefs = make();
      document.cookie = 'theme=dark';
      const node = bare(prefs);
      const { container, errors, recoverable } = await hydrate(node, serve(node));
      const text = container.querySelector('script')!.textContent;
      const other = definePrefs({
        theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('data-mode'),
      });
      act(() => root!.render(bare(other)));
      expect(html.getAttribute('data-mode')).toBe('dark'); // the new script is applied
      expect(container.querySelector('script')!.textContent).toBe(text);
      expect(errors).not.toHaveBeenCalled();
      expect(recoverable).not.toHaveBeenCalled();
    });

    it('hands React the same __html object on every render, so no React version re-writes the script', async () => {
      const prefs = make();
      document.cookie = 'theme=dark';
      // a new snapshot re-renders the provider, as a refreshed Server Component payload does
      const node = (snapshot: PrefsProviderProps['snapshot']) => bare(prefs, { snapshot });
      const markup = serve(node({ theme: 'dark' }));
      const block = restore;
      const record = recordScriptHtml();
      restore = () => {
        record.restore();
        block();
      };
      const { errors, recoverable } = await hydrate(node({ theme: 'dark' }), markup);
      act(() => root!.render(node({ theme: 'dark' })));
      act(() => root!.render(node({ theme: 'light' })));
      // hydration and the two re-renders; React 18 stores props only at hydration and on a commit that
      // changed something, so it records fewer
      expect(record.values.length).toBeGreaterThanOrEqual(Number(version.split('.')[0]) < 19 ? 1 : 3);
      expect(new Set(record.values).size).toBe(1);
      expect(errors).not.toHaveBeenCalled();
      expect(recoverable).not.toHaveBeenCalled();
    });

    it('follows other tabs when the tab becomes visible again', async () => {
      const prefs = make();
      const node = bare(prefs);
      await hydrate(node, serve(node));
      expect(html.className).toBe('system');
      expect(html.getAttribute('data-sidebar')).toBe('true');

      document.cookie = 'theme=light'; // another tab, nobody here subscribes
      document.cookie = 'sidebar=false';
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(html.className).toBe('light');
      expect(html.getAttribute('data-sidebar')).toBe('false');
    });
  });
});
