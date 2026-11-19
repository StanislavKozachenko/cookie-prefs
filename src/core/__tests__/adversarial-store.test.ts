// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { definePrefs, pref, prefsScript } from '../../index';

// Attacks on the store: re-entrant listeners, handles sharing a cookie, writes behind
// its back, its per-raw-string cache, subscription churn and hostile environments.

const html = document.documentElement;

const clearCookies = () => {
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
};

afterEach(() => {
  delete (document as { cookie?: string }).cookie;
  clearCookies();
  for (const { name } of [...html.attributes]) html.removeAttribute(name);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A CookieStore stand-in that counts its listeners and can fire `change` like the browser. */
const fakeCookieStore = () => {
  const target = new EventTarget();
  let listeners = 0;
  const store = {
    addEventListener: (type: string, fn: EventListener) => {
      listeners++;
      target.addEventListener(type, fn);
    },
    removeEventListener: (type: string, fn: EventListener) => {
      listeners--;
      target.removeEventListener(type, fn);
    },
    change: () => target.dispatchEvent(new Event('change')),
    get listeners() {
      return listeners;
    },
  };
  vi.stubGlobal('cookieStore', store);
  return store;
};

describe('listeners that write, subscribe and unsubscribe', () => {
  it('a listener can unsubscribe itself and others during a notification', () => {
    const { theme } = definePrefs({ theme: pref.enum(['a', 'b', 'c']).default('a') });
    const calls: string[] = [];
    const offs: (() => void)[] = [];
    offs.push(
      theme.subscribe((v) => {
        calls.push(`1:${v}`);
        offs[0]!();
        offs[2]!();
      }),
    );
    offs.push(theme.subscribe((v) => calls.push(`2:${v}`)));
    offs.push(theme.subscribe((v) => calls.push(`3:${v}`)));
    theme.set('b');
    theme.set('c');
    expect(calls).toEqual(['1:b', '2:b', '2:c']);
    offs[1]!();
  });

  it('an unsubscribe called many times, or after the last one, changes nothing', () => {
    const store = fakeCookieStore();
    const { theme } = definePrefs({ theme: pref.enum(['a', 'b']).default('a') });
    const a = vi.fn();
    const b = vi.fn();
    const offA = theme.subscribe(a);
    const offB = theme.subscribe(b);
    offA();
    offA();
    offA();
    theme.set('b');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
    expect(store.listeners).toBe(1);
    offB();
    offB();
    expect(store.listeners).toBe(0);
  });

  it('every listener ends up with the final value when a listener writes another pref', () => {
    const { a, b } = definePrefs({ a: pref.number().default(0), b: pref.number().default(0) });
    const seenB: number[] = [];
    const offA = a.subscribe((v) => b.set(v * 10));
    const offB = b.subscribe((v) => seenB.push(v));
    a.set(1);
    a.set(2);
    expect(seenB).toEqual([10, 20]);
    expect(b.get()).toBe(20);
    offA();
    offB();
  });
});

describe('several handles on one cookie', () => {
  const twins = () => [
    definePrefs({ theme: pref.enum(['light', 'dark']).default('light').reflect('data-theme') }).theme,
    definePrefs(
      { me: pref.enum(['light', 'dark', 'dim']).default('dim').reflect('data-t') },
      { prefix: 'the', path: '/' },
    ).me,
    definePrefs({ x: pref.string().options({ name: 'theme' }) }).x,
  ] as const;

  it('read the same cookie at once, each with its own codec and default', () => {
    const [a, b, c] = twins();
    expect([a.name, b.name, c.name]).toEqual(['theme', 'theme', 'theme']);
    a.set('dark');
    expect([a.get(), b.get(), c.get()]).toEqual(['dark', 'dark', 'dark']);
    c.set('blue');
    expect([a.get(), b.get(), c.get()]).toEqual(['light', 'dim', 'blue']);
    b.reset();
    expect([a.get(), b.get(), c.get()]).toEqual(['light', 'dim', undefined]);
  });

  it('all follow a write through any of them on the next change event', () => {
    const store = fakeCookieStore();
    const [a, b, c] = twins();
    const seen = { a: vi.fn(), b: vi.fn(), c: vi.fn() };
    const offs = [a.subscribe(seen.a), b.subscribe(seen.b), c.subscribe(seen.c)];
    expect(store.listeners).toBe(1);
    a.set('dark');
    expect(seen.a).toHaveBeenLastCalledWith('dark');
    // the browser fires `change` for this tab's own writes too
    store.change();
    expect(seen.b).toHaveBeenLastCalledWith('dark');
    expect(seen.c).toHaveBeenLastCalledWith('dark');
    expect(html.getAttribute('data-t')).toBe('dark');
    store.change();
    expect([seen.a, seen.b, seen.c].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    offs.forEach((off) => off());
    expect(store.listeners).toBe(0);
  });

  it('keep separate inline-script entries that agree with the client', () => {
    const [a, b] = twins();
    document.cookie = 'theme=dark';
    new Function(prefsScript({ a, b }))();
    expect([html.getAttribute('data-theme'), html.getAttribute('data-t')]).toEqual(['dark', 'dark']);
    document.cookie = 'theme=dim';
    new Function(prefsScript({ a, b }))();
    expect([html.getAttribute('data-theme'), html.getAttribute('data-t')]).toEqual(['light', 'dim']);
  });
});

describe('writes behind the store’s back', () => {
  it('get() and updaters see a cookie written directly, at once', () => {
    const { n } = definePrefs({ n: pref.number().default(1) });
    expect(n.get()).toBe(1);
    document.cookie = 'n=41';
    expect(n.get()).toBe(41);
    n.set((prev) => prev + 1);
    expect(n.get()).toBe(42);
    document.cookie = 'n=; Max-Age=0; Path=/';
    n.set((prev) => prev * 2);
    expect(n.get()).toBe(2);
  });

  it('a subscriber learns of the direct write on the next check, exactly once', () => {
    const store = fakeCookieStore();
    const { n } = definePrefs({ n: pref.number().default(1).reflect('data-n') });
    const listener = vi.fn();
    const off = n.subscribe(listener);
    document.cookie = 'n=5';
    expect(listener).not.toHaveBeenCalled();
    store.change();
    store.change();
    expect(listener.mock.calls).toEqual([[5]]);
    expect(html.getAttribute('data-n')).toBe('5');
    off();
  });
});

describe('the per-raw-string cache', () => {
  it('stays correct and referentially stable past its capacity', () => {
    const { cols } = definePrefs({ cols: pref.json(z.array(z.number())).default([]) });
    // many distinct raw strings, from the server path and the browser path interleaved
    for (let i = 0; i < 60; i++) {
      expect(cols.read(`cols=%5B${i}%5D`)).toEqual([i]);
      cols.set([i, i]);
      const first = cols.get();
      expect(first).toEqual([i, i]);
      // consecutive reads of an unchanged cookie: same object (useSyncExternalStore)
      expect(cols.get()).toBe(first);
      expect(cols.get()).toBe(first);
    }
  });

  it('never returns one raw string’s value for another', () => {
    const { s } = definePrefs({ s: pref.custom({ parse: (raw) => ({ raw }), serialize: (v: { raw: string }) => v.raw }) });
    const raws = Array.from({ length: 40 }, (_, i) => `v${i % 13}`);
    for (const raw of raws) expect(s.read({ s: raw })).toEqual({ raw });
  });

  it('does not cache a parse that threw, so a later read retries', () => {
    let fail = true;
    const { s } = definePrefs({
      s: pref.custom({
        parse: (raw) => {
          if (fail) throw Error('flaky');
          return raw;
        },
        serialize: String,
      }),
    });
    expect(s.read({ s: 'a' })).toBeUndefined();
    fail = false;
    expect(s.read({ s: 'a' })).toBe('a');
  });
});

describe('subscription churn', () => {
  it('leaves no CookieStore listener behind', () => {
    const store = fakeCookieStore();
    const prefs = definePrefs({ a: pref.boolean(), b: pref.number(), c: pref.string() });
    const handles = Object.values(prefs);
    for (let i = 0; i < 200; i++) {
      const offs = handles.map((h) => h.subscribe(() => {}));
      expect(store.listeners).toBe(1);
      offs.reverse().forEach((off) => off());
      expect(store.listeners).toBe(0);
    }
  });

  it('leaves no BroadcastChannel open', () => {
    let open = 0;
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        onmessage: unknown = null;
        constructor() {
          open++;
        }
        postMessage() {}
        close() {
          open--;
        }
      },
    );
    const { a, b } = definePrefs({ a: pref.boolean(), b: pref.boolean() });
    for (let i = 0; i < 100; i++) {
      const offA = a.subscribe(() => {});
      const offB = b.subscribe(() => {});
      a.set(i % 2 == 0);
      b.reset();
      expect(open).toBe(1);
      offB();
      offA();
      expect(open).toBe(0);
    }
  });
});

describe('hostile environments', () => {
  it('without location, set() writes nothing and never throws', () => {
    vi.stubGlobal('location', undefined);
    const { s } = definePrefs({ s: pref.string() });
    expect(() => s.set('x')).not.toThrow();
    expect(s.get()).toBeUndefined();
    // an explicit `secure` needs no location
    const { t } = definePrefs({ t: pref.string() }, { secure: false });
    t.set('y');
    expect(t.get()).toBe('y');
  });

  it('a document.cookie setter that throws leaves get(), set() and subscribe() usable', () => {
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    document.cookie = 'theme=dark';
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => desc.get!.call(document),
      set: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    const { theme } = definePrefs({ theme: pref.enum(['light', 'dark']).default('light') });
    const listener = vi.fn();
    const off = theme.subscribe(listener);
    expect(() => theme.set('light')).not.toThrow();
    expect(() => theme.reset()).not.toThrow();
    expect(theme.get()).toBe('dark');
    expect(listener).not.toHaveBeenCalled();
    off();
  });
});
