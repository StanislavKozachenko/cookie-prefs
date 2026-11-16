import { act, StrictMode, version, type ReactNode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { definePrefs, pref, prefsScript, snapshotPrefs, type PrefsRecord } from '../index';
import { PrefsProvider, usePref, type PrefsProviderProps } from './index';

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

/** Every script element the provider inserts to run the reflection again. */
const spyReruns = () => {
  const reruns: HTMLScriptElement[] = [];
  const append = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
    if (node instanceof HTMLScriptElement) reruns.push(node);
    return append(node);
  });
  return reruns;
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
    const reruns = spyReruns();
    render(<PrefsProvider>{prefs.theme.key}</PrefsProvider>);
    expect(reruns).toEqual([]);
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

  it('reuses the server nonce, which the client never renders', async () => {
    const prefs = make();
    const markup = ssr(app(prefs, { nonce: 'abc' }));
    const reruns = spyReruns();
    // The client may not know the per-request nonce at all.
    await hydrate(app(prefs), markup);
    expect(reruns.length).toBeGreaterThan(0);
    for (const s of reruns) {
      expect(s.getAttribute('nonce')).toBe('abc');
      expect(s.text).toBe(prefsScript(prefs));
      expect(s.isConnected).toBe(false);
    }
  });

  it('uses the nonce prop for a client-only mount', () => {
    const prefs = make();
    const reruns = spyReruns();
    render(app(prefs, { nonce: 'xyz' }));
    expect(reruns.map((s) => s.getAttribute('nonce'))).toEqual(['xyz']);
  });
});
