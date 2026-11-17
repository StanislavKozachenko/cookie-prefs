import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { definePrefs, pref } from './index';

const html = document.documentElement;

const clearCookies = () => {
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
};

/** Record every string assigned to `document.cookie`, still writing it through. */
const spyCookieWrites = () => {
  const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
  const writes: string[] = [];
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => desc.get!.call(document),
    set: (v: string) => {
      writes.push(v);
      desc.set!.call(document, v);
    },
  });
  return writes;
};

afterEach(() => {
  delete (document as { cookie?: string }).cookie;
  clearCookies();
  html.className = '';
  for (const { name } of [...html.attributes]) html.removeAttribute(name);
  vi.unstubAllGlobals();
});

const make = () =>
  definePrefs({
    theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class', { dark: 'is-dark' }),
    sidebar: pref.boolean().default(true).reflect('data-sidebar'),
    pageSize: pref.number().default(25).reflect('--page-size'),
    locale: pref.string().reflect(['data-locale', '--locale']),
    columns: pref.json(z.array(z.string())).default([]),
  });

describe('get / set / reset', () => {
  it('reads the default when there is no cookie', () => {
    const prefs = make();
    expect(prefs.theme.get()).toBe('system');
    expect(prefs.locale.get()).toBeUndefined();
    expect(prefs.columns.get()).toEqual([]);
  });

  it('writes the cookie and reads it back synchronously', () => {
    const prefs = make();
    prefs.theme.set('dark');
    prefs.columns.set(['a', 'b;c']);
    prefs.locale.set('de AT');
    expect(prefs.theme.get()).toBe('dark');
    expect(prefs.columns.get()).toEqual(['a', 'b;c']);
    expect(prefs.locale.get()).toBe('de AT');
    expect(document.cookie).toContain('theme=dark');
    expect(document.cookie).toContain('locale=de%20AT');
  });

  it('passes the current value to an updater', () => {
    const prefs = make();
    const seen: number[] = [];
    const add = (n: number) => (seen.push(n), n + 25);
    prefs.pageSize.set(add);
    prefs.pageSize.set(add);
    expect(seen).toEqual([25, 50]);
    expect(prefs.pageSize.get()).toBe(75);
    prefs.locale.set((prev) => prev ?? 'en');
    expect(prefs.locale.get()).toBe('en');
  });

  it('reset deletes the cookie, so the default comes back', () => {
    const prefs = make();
    prefs.sidebar.set(false);
    expect(prefs.sidebar.get()).toBe(false);
    prefs.sidebar.reset();
    expect(prefs.sidebar.get()).toBe(true);
    expect(document.cookie).not.toContain('sidebar');
  });

  it('reads a tampered cookie as the default', () => {
    const prefs = make();
    document.cookie = 'theme=blue';
    document.cookie = 'columns=%5B1%5D';
    document.cookie = 'pageSize=NaN';
    expect(prefs.theme.get()).toBe('system');
    expect(prefs.columns.get()).toEqual([]);
    expect(prefs.pageSize.get()).toBe(25);
  });
});

describe('sandboxed iframe (document.cookie throws)', () => {
  const sandbox = () => {
    const denied = () => {
      throw new DOMException('The document is sandboxed and lacks the "allow-same-origin" flag.', 'SecurityError');
    };
    Object.defineProperty(document, 'cookie', { configurable: true, get: denied, set: denied });
  };

  it('reads the default and never throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prefs = make();
    sandbox();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    expect(prefs.theme.get()).toBe('system');
    expect(prefs.columns.get()).toBe(prefs.columns.defaultValue);
    expect(() => prefs.theme.set('dark')).not.toThrow();
    expect(() => prefs.theme.set((t) => (t == 'dark' ? 'light' : 'dark'))).not.toThrow();
    expect(() => prefs.theme.reset()).not.toThrow();
    expect(prefs.theme.get()).toBe('system');
    expect(html.className).toBe('system');
    expect(listener).not.toHaveBeenCalled();
    off();
    warn.mockRestore();
  });
});

describe('lone surrogates', () => {
  const text = '😀abc'.slice(1); // lone low surrogate, e.g. a truncated input

  it('set() stores U+FFFD in their place', () => {
    const prefs = make();
    expect(() => prefs.locale.set(text)).not.toThrow();
    expect(prefs.locale.get()).toBe('�abc');
    expect(html.getAttribute('data-locale')).toBe('�abc');
    // JSON.stringify escapes lone surrogates, so json prefs keep them as they are
    prefs.columns.set([text]);
    expect(prefs.columns.get()).toEqual([text]);
  });

  it('set() writes nothing and does not throw without String.prototype.toWellFormed', () => {
    const proto = String.prototype as { toWellFormed?: unknown };
    const original = proto.toWellFormed;
    // A no-op rather than deleting it: jsdom's own `document.cookie` setter uses it.
    proto.toWellFormed = function (this: string) {
      return String(this);
    };
    try {
      const prefs = make();
      prefs.locale.set('ok');
      expect(() => prefs.locale.set(text)).not.toThrow();
      expect(prefs.locale.get()).toBe('ok');
      expect(html.getAttribute('data-locale')).toBe('ok');
    } finally {
      proto.toWellFormed = original;
    }
  });
});

describe('browser cookie attributes', () => {
  it('writes the default attributes and no Secure on http', () => {
    const writes = spyCookieWrites();
    const prefs = make();
    prefs.theme.set('dark');
    prefs.theme.reset();
    expect(writes).toEqual([
      'theme=dark; Path=/; Max-Age=34560000; SameSite=lax',
      'theme=; Path=/; Max-Age=0; SameSite=lax',
    ]);
  });

  it('adds Secure on https pages unless secure is false', () => {
    const writes = spyCookieWrites();
    vi.stubGlobal('location', { protocol: 'https:' });
    const prefs = definePrefs({
      a: pref.string(),
      b: pref.string().options({ secure: false }),
    });
    prefs.a.set('1');
    prefs.b.set('2');
    expect(writes[0]).toBe('a=1; Path=/; Max-Age=34560000; SameSite=lax; Secure');
    expect(writes[1]).toBe('b=2; Path=/; Max-Age=34560000; SameSite=lax');
  });

  it('applies set and pref overrides', () => {
    const writes = spyCookieWrites();
    const prefs = definePrefs(
      { a: pref.string().options({ name: 'x', maxAge: 60, path: '/app' }) },
      { domain: 'example.test', sameSite: 'strict', secure: true, partitioned: true },
    );
    prefs.a.set('v');
    prefs.a.reset();
    expect(writes).toEqual([
      'x=v; Path=/app; Domain=example.test; Max-Age=60; SameSite=strict; Secure; Partitioned',
      'x=; Path=/app; Domain=example.test; Max-Age=0; SameSite=strict; Secure; Partitioned',
    ]);
  });
});

describe('subscribe', () => {
  it('notifies on set and reset, and stops after unsubscribe', () => {
    const prefs = make();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    prefs.theme.set('dark');
    prefs.theme.reset();
    expect(listener.mock.calls).toEqual([['dark'], ['system']]);
    off();
    prefs.theme.set('light');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not notify when the value is unchanged', () => {
    const prefs = make();
    const listener = vi.fn();
    const off = prefs.theme.subscribe(listener);
    prefs.theme.set('system'); // cookie appears, value is still the default
    prefs.theme.set('dark');
    prefs.theme.set('dark');
    prefs.theme.set(() => 'dark');
    expect(listener.mock.calls).toEqual([['dark']]);
    off();
  });

  it('notifies every listener, and only those of the changed pref', () => {
    const prefs = make();
    const a = vi.fn();
    const b = vi.fn();
    const other = vi.fn();
    const offs = [prefs.sidebar.subscribe(a), prefs.sidebar.subscribe(b), prefs.theme.subscribe(other)];
    prefs.sidebar.set(false);
    expect(a).toHaveBeenCalledWith(false);
    expect(b).toHaveBeenCalledWith(false);
    expect(other).not.toHaveBeenCalled();
    offs.forEach((off) => off());
  });

  it('tolerates a double unsubscribe', () => {
    const prefs = make();
    const off = prefs.theme.subscribe(() => {});
    off();
    expect(off).not.toThrow();
  });
});

describe('referential stability', () => {
  it('returns the same object for the same raw cookie', () => {
    const prefs = make();
    prefs.columns.set(['a']);
    const first = prefs.columns.get();
    expect(prefs.columns.get()).toBe(first);
    prefs.columns.set(['a']);
    expect(prefs.columns.get()).toBe(first);
    prefs.columns.set(['b']);
    expect(prefs.columns.get()).not.toBe(first);
  });

  it('keeps snapshot reads and cookie reads stable side by side', () => {
    const prefs = make();
    prefs.columns.set(['client']);
    const snapshot = { columns: '["server"]' };
    const server = prefs.columns.read(snapshot);
    const client = prefs.columns.get();
    expect(prefs.columns.read(snapshot)).toBe(server);
    expect(prefs.columns.get()).toBe(client);
  });

  it('returns the default object itself when missing or invalid', () => {
    const prefs = make();
    const fallback = prefs.columns.defaultValue;
    expect(prefs.columns.get()).toBe(fallback);
    document.cookie = 'columns=oops';
    expect(prefs.columns.get()).toBe(fallback);
  });
});

describe('reflection after changes', () => {
  it('mirrors values on <html> after set and reset', () => {
    const prefs = make();
    prefs.theme.set('dark');
    prefs.sidebar.set(false);
    prefs.pageSize.set(50);
    prefs.locale.set('de');
    expect(html.className).toBe('is-dark');
    expect(html.getAttribute('data-sidebar')).toBe('false');
    expect(html.style.getPropertyValue('--page-size')).toBe('50');
    expect(html.getAttribute('data-locale')).toBe('de');
    expect(html.style.getPropertyValue('--locale')).toBe('de');

    prefs.theme.set('light');
    expect(html.className).toBe('light');
    prefs.theme.reset();
    expect(html.className).toBe('system');
    prefs.locale.reset();
    expect(html.hasAttribute('data-locale')).toBe(false);
    expect(html.style.getPropertyValue('--locale')).toBe('');
  });

  it('keeps unrelated classes', () => {
    const prefs = make();
    html.className = 'keep';
    prefs.theme.set('dark');
    expect(html.className).toBe('keep is-dark');
  });

  it('applies the current value on the first subscribe', () => {
    const prefs = make();
    document.cookie = 'sidebar=false';
    const off = prefs.sidebar.subscribe(() => {});
    expect(html.getAttribute('data-sidebar')).toBe('false');
    off();
  });

  it('re-applies on the first subscribe even when the value is the one last seen', () => {
    const prefs = make();
    prefs.sidebar.set(false);
    html.setAttribute('data-sidebar', 'true'); // e.g. React resetting <html> on remount
    const off = prefs.sidebar.subscribe(() => {});
    expect(html.getAttribute('data-sidebar')).toBe('false');
    off();
  });

  describe('after the DOM moved without this handle (provider re-apply, other tab, server)', () => {
    /** What another tab plus the provider's re-apply on `visibilitychange` leave behind. */
    const external = (cookie: string, attr: string, value: string) => {
      document.cookie = cookie;
      html.setAttribute(attr, value);
    };

    it('reflects a toggle with no hook', () => {
      const prefs = make();
      prefs.sidebar.set((open) => !open); // this tab collapses
      expect(html.getAttribute('data-sidebar')).toBe('false');
      external('sidebar=true', 'data-sidebar', 'true'); // another tab expands
      prefs.sidebar.set((open) => !open); // collapse again here
      expect(prefs.sidebar.get()).toBe(false);
      expect(html.getAttribute('data-sidebar')).toBe('false');
    });

    it('reflects set() of the value this handle saw last, with no subscriber', () => {
      const prefs = make();
      prefs.theme.set('dark');
      external('theme=light', 'class', 'light');
      prefs.theme.set('dark');
      expect(html.className).toBe('is-dark');
      prefs.theme.reset();
      external('theme=dark', 'class', 'is-dark');
      prefs.theme.reset();
      expect(html.className).toBe('system');
    });

    it('reflects set() after the last subscriber unmounted', () => {
      const prefs = make();
      const off = prefs.pageSize.subscribe(() => {}); // sees 25
      off();
      document.cookie = 'pageSize=50';
      html.style.setProperty('--page-size', '50');
      prefs.pageSize.set(25);
      expect(html.style.getPropertyValue('--page-size')).toBe('25');
    });
  });

  it('never throws on a value that is not a valid class', () => {
    const { t } = definePrefs({ t: pref.enum(['a b', 'c']).reflect('class') });
    expect(() => t.set('a b')).not.toThrow();
    expect(t.get()).toBe('a b');
  });
});
