// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definePrefs, pref, readPrefs, snapshotPrefs } from '../../index';

const html = document.documentElement;

const clearCookies = () => {
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
};

afterEach(() => {
  clearCookies();
  html.className = '';
  for (const { name } of [...html.attributes]) html.removeAttribute(name);
  vi.unstubAllGlobals();
});

const density = () =>
  pref.enum(['compact', 'comfortable']).default('comfortable').migrate({ cozy: 'comfortable', tight: 'compact' });

const make = () =>
  definePrefs({
    density: density().reflect(['class', 'data-density'], { compact: 'is-compact' }),
    mode: pref.enum(['a', 'b']).migrate({ old: 'b' }),
  });

/** JavaScript callers can pass any map; the types reject these. */
const loose = (map: Record<string, unknown>) => map as never;

describe('.migrate() reads', () => {
  it('reads an old name as its current value, on every server read path', () => {
    const prefs = make();
    const store = new Map(Object.entries({ density: 'tight', mode: 'old' }).map(([k, value]) => [k, { value }]));
    for (const source of ['density=tight; mode=old', { density: 'tight', mode: 'old' }, store])
      expect(readPrefs(prefs, source)).toEqual({ density: 'compact', mode: 'b' });
    expect(prefs.density.read('density=cozy')).toBe('comfortable');
    expect(prefs.density.read('density=%74ight')).toBe('compact');
    expect(prefs.density.read('density="tight"')).toBe('compact');
  });

  it('reads current values as themselves and anything else as the default', () => {
    const prefs = make();
    expect(readPrefs(prefs, 'density=compact; mode=a')).toEqual({ density: 'compact', mode: 'a' });
    for (const raw of ['blue', 'COZY', ' cozy', '', 'toString', '__proto__', 'constructor', 'hasOwnProperty'])
      expect(readPrefs(prefs, { density: raw, mode: raw }), raw).toEqual({
        density: 'comfortable',
        mode: undefined,
      });
    expect(readPrefs(prefs, '')).toEqual({ density: 'comfortable', mode: undefined });
  });

  it('get() reads an old name in document.cookie as its current value', () => {
    const prefs = make();
    document.cookie = 'density=cozy';
    document.cookie = 'mode=old';
    expect(prefs.density.get()).toBe('comfortable');
    expect(prefs.mode.get()).toBe('b');
  });

  it('snapshots keep the raw old name, which reads back as the current value', () => {
    const prefs = make();
    const snapshot = snapshotPrefs(prefs, 'density=tight; mode=nope; other=1');
    expect(snapshot).toEqual({ density: 'tight', mode: 'nope' });
    expect(readPrefs(prefs, snapshot)).toEqual({ density: 'compact', mode: undefined });
  });

  it('ignores keys that are current values and values that are not', () => {
    const { d } = definePrefs({
      d: pref
        .enum(['compact', 'comfortable'])
        .migrate(loose({ compact: 'comfortable', cozy: 'nope', old: undefined, gone: null, wide: 'compact' })),
    });
    expect(d.read({ d: 'compact' })).toBe('compact');
    expect(d.read({ d: 'comfortable' })).toBe('comfortable');
    expect(d.read({ d: 'cozy' })).toBeUndefined();
    expect(d.read({ d: 'old' })).toBeUndefined();
    expect(d.read({ d: 'gone' })).toBeUndefined();
    expect(d.read({ d: 'wide' })).toBe('compact');
  });

  it('takes only own keys of the map, and keys named like Object.prototype members', () => {
    const polluted = Object.prototype as unknown as Record<string, unknown>;
    polluted.stale = 'b';
    try {
      const { m } = definePrefs({
        m: pref.enum(['a', 'b']).migrate(loose(JSON.parse('{"__proto__":"a","toString":"b","x":"a"}'))),
      });
      expect(m.read({ m: '__proto__' })).toBe('a');
      expect(m.read({ m: 'toString' })).toBe('b');
      expect(m.read({ m: 'x' })).toBe('a');
      expect(m.read({ m: 'stale' })).toBeUndefined();
      expect(m.read({ m: 'constructor' })).toBeUndefined();
    } finally {
      delete polluted.stale;
    }
  });
});

describe('.migrate() writes', () => {
  it('never rewrites the cookie on read; the next set() writes the current name', () => {
    const prefs = make();
    document.cookie = 'density=cozy';
    const write = vi.spyOn(document, 'cookie', 'set');
    prefs.density.get();
    prefs.density.read(document.cookie);
    prefs.density.subscribe(() => {})();
    expect(write).not.toHaveBeenCalled();
    expect(document.cookie).toBe('density=cozy');

    prefs.density.set((prev) => prev);
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
    expect(document.cookie).toBe('density=comfortable');
    document.cookie = 'density=tight';
    prefs.density.set('comfortable');
    expect(document.cookie).toBe('density=comfortable');
    expect(prefs.density.toCookie('compact').value).toBe('compact');
  });

  it('notifies nobody when an old name is replaced by its current value', () => {
    const prefs = make();
    document.cookie = 'density=cozy';
    const listener = vi.fn();
    const off = prefs.density.subscribe(listener);
    prefs.density.set('comfortable');
    expect(listener).not.toHaveBeenCalled();
    prefs.density.set('compact');
    expect(listener).toHaveBeenCalledWith('compact');
    off();
  });
});

describe('.migrate() reflection on the client', () => {
  it('applies the current value of an old name and removes the other classes', () => {
    const prefs = make();
    html.className = 'keep is-compact';
    document.cookie = 'density=cozy';
    prefs.density.subscribe(() => {})();
    expect(html.className).toBe('keep comfortable');
    expect(html.getAttribute('data-density')).toBe('comfortable');

    document.cookie = 'density=tight';
    prefs.density.subscribe(() => {})();
    expect(html.className).toBe('keep is-compact');
    expect(html.getAttribute('data-density')).toBe('is-compact');

    prefs.density.set('comfortable');
    expect(html.className).toBe('keep comfortable');
  });
});

describe('.migrate() builders', () => {
  it('is immutable and keeps values the current list', () => {
    const base = pref.enum(['compact', 'comfortable']);
    const migrated = base.migrate({ cozy: 'comfortable' });
    const more = migrated.migrate({ tight: 'compact' });
    expect(migrated).not.toBe(base);
    expect(base.values).toEqual(['compact', 'comfortable']);
    expect(migrated.values).toEqual(['compact', 'comfortable']);
    expect(more.values).toEqual(['compact', 'comfortable']);
    const { a, b, c } = definePrefs({ a: base, b: migrated, c: more });
    expect(a.read({ a: 'cozy' })).toBeUndefined();
    expect(b.read({ b: 'cozy' })).toBe('comfortable');
    expect(b.read({ b: 'tight' })).toBeUndefined();
    expect(c.read({ c: 'cozy' })).toBe('comfortable');
    expect(c.read({ c: 'tight' })).toBe('compact');
  });

  it('chains in any order with default, options and reflect', () => {
    const chains = [
      pref.enum(['x', 'y']).migrate({ old: 'y' }).default('x').options({ name: 'n' }).reflect('data-n'),
      pref.enum(['x', 'y']).default('x').migrate({ old: 'y' }).reflect('data-n').options({ name: 'n' }),
      pref.enum(['x', 'y']).options({ name: 'n' }).reflect('data-n').default('x').migrate({ old: 'y' }),
      pref.enum(['x', 'y']).reflect('data-n').options({ name: 'n' }).migrate({ old: 'y' }).default('x'),
    ];
    for (const builder of chains) {
      const { p } = definePrefs({ p: builder });
      expect(p.name).toBe('n');
      expect(p.read({ n: 'old' })).toBe('y');
      expect(p.read({ n: 'nope' })).toBe('x');
      html.removeAttribute('data-n');
      document.cookie = 'n=old';
      p.subscribe(() => {})();
      expect(html.getAttribute('data-n')).toBe('y');
    }
  });

  it('adds to the map on repeated calls, later calls winning', () => {
    const { p } = definePrefs({
      p: pref.enum(['x', 'y', 'z']).migrate({ a: 'x', b: 'y' }).migrate({ b: 'z', c: 'z' }),
    });
    expect(['a', 'b', 'c'].map((raw) => p.read({ p: raw }))).toEqual(['x', 'z', 'z']);
  });
});
