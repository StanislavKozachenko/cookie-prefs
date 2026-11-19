import { parse } from 'acorn';
import { act, StrictMode, Suspense, useEffect, type ReactNode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { definePrefs, pref, snapshotPrefs, type PrefsRecord } from '../../index';
import { prefsScript } from '../../script/index';
import { PrefsProvider, usePref } from '../index';
import { reapply } from '../reapply';

// Attacks on `cookie-prefs/react` and the core inline script it renders: hostile
// configs, snapshots that disagree with the browser, many consumers, Strict Mode and
// Suspense.

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
  document.body.innerHTML = '';
  clearCookies();
  resetHtml();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete (globalThis as { pwned?: unknown }).pwned;
});

const ssr = (node: ReactNode) => {
  vi.stubGlobal('document', undefined);
  try {
    return renderToString(node);
  } finally {
    vi.unstubAllGlobals();
  }
};

const render = (node: ReactNode) => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
};

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

const state = () => ({
  className: html.className,
  attrs: Object.fromEntries([...html.attributes].map((a) => [a.name, a.value])),
});

const breakout = '</script><script>globalThis.pwned=1</script><!--<script>';
const hostile = [breakout, '")});globalThis.pwned=1;//', '\\"', '\\', '  ', '<!--', ']]>', '&lt;', '})("x")', '😀'.slice(1)];

describe('hostile configs cannot leave the core inline script', () => {
  /** Every place a config string reaches the script: values, value map, default, targets, names. */
  const configs = (): [string, () => PrefsRecord][] =>
    hostile.map((h) => [
      JSON.stringify(h),
      () => {
        vi.stubEnv('NODE_ENV', 'production'); // classes with spaces are a dev-time error
        try {
          return definePrefs(
            {
              e: pref
                .enum([h, 'b'])
                .default(h)
                .reflect(['class', 'data-e', `--${h}` as `--${string}`, `data-${h}` as `data-${string}`], { b: h }),
              s: pref.string().default(h).reflect(['data-s', '--s']),
              // a name with a lone surrogate cannot be encoded; the prefix carries the rest
              n: pref.number().reflect('data-n').options(h == '😀'.slice(1) ? {} : { name: `n${h}` }),
            },
            { prefix: h == '😀'.slice(1) ? '' : h },
          );
        } finally {
          vi.unstubAllEnvs();
        }
      },
    ]);

  it.each(configs())('%s', (_, make) => {
    const prefs = make();
    const source = prefsScript(prefs);
    expect(() => parse(source, { ecmaVersion: 5, sourceType: 'script' })).not.toThrow();
    // inlined by hand, and server-rendered by the provider with a hostile nonce
    for (const markup of [
      `<script>${source}</script><p>after</p>`,
      ssr(
        <PrefsProvider script={source} nonce={breakout}>
          <p>after</p>
        </PrefsProvider>,
      ),
    ]) {
      const div = document.createElement('div');
      div.innerHTML = markup;
      const scripts = div.querySelectorAll('script');
      expect(scripts).toHaveLength(1);
      expect(scripts[0]!.textContent).toBe(source);
      expect(div.querySelector('p')?.textContent).toBe('after');
    }
    resetHtml();
    expect(() => new Function(source)()).not.toThrow();
    expect((globalThis as { pwned?: unknown }).pwned).toBeUndefined();
    const fromScript = state();
    resetHtml();
    reapply(source);
    expect(state()).toEqual(fromScript);
    resetHtml();
    for (const p of Object.values(prefs)) p.subscribe(() => {})();
    expect(state()).toEqual(fromScript);
  });

  it('reapply ignores a script string that was tampered with, and never runs it', () => {
    const { t } = definePrefs({ t: pref.enum(['a', 'b']).default('a').reflect('data-t') });
    const source = prefsScript({ t });
    for (const tampered of [
      source.replace('JSON.parse', 'eval'),
      source.slice(0, -1) + '+(globalThis.pwned=1))',
      source.replace('})("', '})(globalThis.pwned=1,"'),
      source + ';globalThis.pwned=1',
    ])
      expect(() => reapply(tampered)).not.toThrow();
    expect((globalThis as { pwned?: unknown }).pwned).toBeUndefined();
  });
});

describe('snapshots that disagree with the browser', () => {
  const make = () =>
    definePrefs({
      theme: pref.enum(['light', 'dark']).default('light').reflect('data-theme'),
      cols: pref.json(z.array(z.string())).default([]),
    });
  type P = ReturnType<typeof make>;
  const Show = ({ prefs }: { prefs: P }) => {
    const [theme] = usePref(prefs.theme);
    const [cols] = usePref(prefs.cols);
    return <p>{`${theme} ${cols.join('|')}`}</p>;
  };
  const app = (prefs: P, snapshot: Record<string, string>) => (
    <PrefsProvider snapshot={snapshot} script={prefsScript(prefs)}>
      <Show prefs={prefs} />
    </PrefsProvider>
  );

  it('hydrate without errors and then follow the cookie', async () => {
    const prefs = make();
    const snapshot = { theme: 'dark', cols: '["a"]' };
    const markup = ssr(app(prefs, snapshot));
    expect(markup).toContain('<p>dark a</p>');
    document.cookie = 'theme=light';
    document.cookie = `cols=${encodeURIComponent('["b","c"]')}`;
    const { container, errors, recoverable } = await hydrate(app(prefs, snapshot), markup);
    expect(errors).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('p')!.textContent).toBe('light b|c');
    expect(html.getAttribute('data-theme')).toBe('light');
  });

  it('hostile snapshot values render the default on the server and during hydration', async () => {
    const prefs = make();
    const snapshot = {
      theme: 'x'.repeat(10000),
      cols: '{"__proto__":{"polluted":1}}',
      __proto__: 'x',
      constructor: 'y',
    } as Record<string, string>;
    const markup = ssr(app(prefs, snapshot));
    expect(markup).toContain('<p>light </p>');
    const { errors, recoverable } = await hydrate(app(prefs, snapshot), markup);
    expect(errors).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a snapshot taken from a hostile header holds only the prefs’ own decodable cookies', () => {
    const prefs = make();
    const header = `theme=%E0%A4%A; theme=dark; cols="[%22a%22]"; session=secret; __proto__=1; constructor=2`;
    expect(snapshotPrefs(prefs, header)).toEqual({ cols: '["a"]' });
  });
});

describe('many consumers and odd render modes', () => {
  const make = () => definePrefs({ n: pref.number().default(0).reflect('data-n') });

  it('keeps 300 components on one pref in sync and renders each once per change', () => {
    const { n } = make();
    let renders = 0;
    const Cell = () => {
      renders++;
      return <i>{usePref(n)[0]}</i>;
    };
    const container = render(
      <>
        {Array.from({ length: 300 }, (_, i) => (
          <Cell key={i} />
        ))}
      </>,
    );
    renders = 0;
    act(() => n.set(7));
    expect(renders).toBe(300);
    expect(new Set([...container.querySelectorAll('i')].map((i) => i.textContent))).toEqual(new Set(['7']));
    act(() => {
      n.set(8);
      n.set(9);
      n.reset();
      n.set((v) => v + 1);
    });
    expect(new Set([...container.querySelectorAll('i')].map((i) => i.textContent))).toEqual(new Set(['1']));
    expect(html.getAttribute('data-n')).toBe('1');
  });

  it('a write from an effect in Strict Mode settles on the last value', () => {
    const { n } = make();
    let effects = 0;
    const Writer = () => {
      const [value, set] = usePref(n);
      useEffect(() => {
        effects++;
        set((v) => v + 1);
      }, [set]);
      return <b>{value}</b>;
    };
    const container = render(
      <StrictMode>
        <Writer />
      </StrictMode>,
    );
    expect(effects).toBe(2);
    expect(container.textContent).toBe('2');
    expect(n.get()).toBe(2);
  });

  it('a component that suspends sees the latest value when it resumes', async () => {
    const { n } = make();
    let resolve!: () => void;
    let pending: Promise<void> | undefined = new Promise<void>((r) => (resolve = r));
    const Lazy = () => {
      const [value] = usePref(n);
      if (pending) throw pending;
      return <b>{value}</b>;
    };
    const container = render(
      <Suspense fallback={<i>wait</i>}>
        <Lazy />
      </Suspense>,
    );
    expect(container.textContent).toBe('wait');
    act(() => n.set(5));
    await act(async () => {
      pending = undefined;
      resolve();
    });
    expect(container.textContent).toBe('5');
  });

  it('unmounting consumers inside a notification leaves the others working', () => {
    const { n } = make();
    const Child = () => <i>{usePref(n)[0]}</i>;
    const Parent = () => {
      const [value] = usePref(n);
      return <>{value < 3 && Array.from({ length: 20 }, (_, i) => <Child key={i} />)}</>;
    };
    const container = render(
      <>
        <Parent />
        <b>
          <Child />
        </b>
      </>,
    );
    act(() => n.set(3));
    expect(container.querySelectorAll('i')).toHaveLength(1);
    act(() => n.set(1));
    expect(container.querySelectorAll('i')).toHaveLength(21);
    expect(container.textContent).toBe('1'.repeat(21));
  });
});
