import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { definePrefs, pref, readPrefs, snapshotPrefs, type PrefsRecord } from '../../index';
import { prefsScript } from '../../script/index';
import { reapply } from '../../react/reapply';

// Attacks on every path that reads a pref cookie: the client (`get()` and the store's
// `<html>` reflection), the inline script, its client port `reapply`, and the server
// helpers over a header string, a plain map and a snapshot. They must agree with each
// other for any cookie string a browser can hold, however hostile.

const html = document.documentElement;

const clearCookies = () => {
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
};

const resetHtml = () => {
  for (const { name } of [...html.attributes]) html.removeAttribute(name);
};

/** Make `document.cookie` return exactly this string, as a browser would. */
const fakeCookie = (value: string) =>
  Object.defineProperty(document, 'cookie', { configurable: true, get: () => value, set: () => {} });

afterEach(() => {
  delete (document as { cookie?: string }).cookie;
  clearCookies();
  resetHtml();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const state = () => ({
  className: html.className,
  attrs: Object.fromEntries([...html.attributes].map((a) => [a.name, a.value])),
});

/** Deterministic PRNG (mulberry32), so a failing case can be replayed. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pick = <T>(next: () => number, list: readonly T[]): T => list[Math.floor(next() * list.length)]!;

const make = () =>
  definePrefs({
    theme: pref.enum(['light', 'dark', 'system', 'a b', 'é', '']).default('system').reflect('data-theme'),
    // the map lists `toString`, which TypeScript requires for an enum value named like it
    mode: pref.enum(['x', 'y', '__proto__', 'toString']).reflect(['class', 'data-mode'], { x: 'is-x', toString: 'toString' }),
    sidebar: pref.boolean().default(true).reflect('data-sidebar'),
    size: pref.number().default(25).reflect(['data-size', '--size']),
    label: pref.string().reflect(['data-label', '--label']),
    xtheme: pref.string().default('none').reflect('data-xtheme'),
    theme2: pref.boolean().reflect('data-theme2'),
    columns: pref.json(z.array(z.string())).default([]),
  });

/**
 * Raw cookie values a browser can hold: no `;`, no control characters, no spaces or
 * tabs at either end (browsers strip those). Other whitespace stays: a server or a
 * sibling subdomain can set a value that starts or ends with U+00A0, U+2028 or U+FEFF.
 */
const hostileValues = [
  'light',
  'dark',
  'x',
  'y',
  'true',
  'false',
  '1',
  '25',
  '"dark"',
  '%22dark%22',
  '""',
  '"',
  '"a"b"',
  "'dark'",
  'dar%6B',
  '%64%61%72%6B',
  'DARK',
  'dark%20',
  '%20dark',
  'a%20b',
  'a+b',
  'é',
  '%C3%A9',
  'e%CC%81',
  '',
  '=',
  'dark=1',
  '==',
  '%',
  '%2',
  '%E0%A4%A',
  '%ED%A0%80',
  '%C0%AF',
  '%25',
  '%2525',
  '%00',
  '%0A',
  '%3B',
  '%3Btheme%3Ddark',
  ',',
  'a,b',
  'a b',
  'a\tb',
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
  'valueOf',
  '-0',
  '1e21',
  '1e%2B21',
  '0x10',
  '%201',
  '1%20',
  'Infinity',
  '-Infinity',
  'NaN',
  '1e400',
  '.5',
  '5.',
  '+5',
  '1_000',
  '0b11',
  '00012',
  '%5B%22a%22%5D',
  '["a"]',
  '[1]',
  '%3C%2Fscript%3E',
  '</script>',
  'a\u2028b',
  '%E2%80%A8',
  '\u00a0dark',
  'dark\u00a0',
  'dark\u2028',
  '\u2029true',
  '\ufeffdark',
  '\u3000x',
  '25\u00a0',
  '\u00a05',
  '😀',
  '%F0%9F%98%80',
  'x'.repeat(4000),
];

/** Cookie names around the prefs' own: prefixes, suffixes, look-alikes. */
const hostileNames = [
  'theme',
  'mode',
  'sidebar',
  'size',
  'label',
  'xtheme',
  'theme2',
  'columns',
  'Theme',
  'th',
  'themes',
  'app.theme',
  'the%6De',
  '\u00a0theme',
  'theme\ufeff',
  '\u2028sidebar',
  '__proto__',
  'constructor',
  'toString',
];

/** A `document.cookie` string as a browser builds it: `name=value` or a bare nameless value, joined by `; `. */
const cookieString = (next: () => number) => {
  const parts: string[] = [];
  for (let n = Math.floor(next() * 7); n-- > 0; ) {
    const value = pick(next, hostileValues);
    parts.push(next() < 0.08 ? value || 'v' : `${pick(next, hostileNames)}=${value}`);
  }
  return parts.join('; ');
};

const scriptState = (prefs: PrefsRecord) => {
  resetHtml();
  new Function(prefsScript(prefs))();
  return state();
};

const reapplyState = (prefs: PrefsRecord) => {
  resetHtml();
  reapply(prefsScript(prefs));
  return state();
};

/** What the store writes on `<html>`: every handle applies its value on the first subscribe. */
const storeState = (prefs: PrefsRecord) => {
  resetHtml();
  for (const p of Object.values(prefs)) p.subscribe(() => {})();
  return state();
};

describe('every read path agrees on hostile cookie strings', () => {
  it('client get(), the store, the inline script, reapply and the server helpers', () => {
    vi.stubEnv('NODE_ENV', 'production'); // the '' enum value is not a class here
    const prefs = make();
    vi.unstubAllEnvs();
    const next = random(56);
    const strings = [
      '',
      hostileValues.map((v, i) => `${hostileNames[i % 8]}=${v}`).join('; '),
      'theme=dark; theme=light',
      'theme=%E0%A4%A; theme=dark',
      'theme; mode=x',
      'theme=; mode=',
      'xtheme=dark; themex=dark; theme2=true',
      'dark',
      'theme=dark',
    ];
    for (let i = 0; i < 400; i++) strings.push(cookieString(next));
    for (const cookie of strings) {
      fakeCookie(cookie);
      const label = JSON.stringify(cookie);
      const fromScript = scriptState(prefs);
      expect(reapplyState(prefs), label).toEqual(fromScript);
      expect(storeState(prefs), label).toEqual(fromScript);

      const values = Object.fromEntries(Object.entries(prefs).map(([k, p]) => [k, p.get()]));
      expect(readPrefs(prefs, cookie), label).toEqual(values);
      // a server-mode snapshot taken from this header reads the same on the client
      const snapshot = snapshotPrefs(prefs, cookie);
      expect(readPrefs(prefs, snapshot), label).toEqual(values);
      expect(JSON.parse(JSON.stringify(snapshot)), label).toEqual(snapshot);
    }
  });

  it.each([
    ['value with a no-break space', 'theme=\u00a0dark'],
    ['value with a line separator', 'theme=dark\u2028'],
    ['value with a BOM', 'theme=\ufeffdark'],
    ['name with a no-break space', '\u00a0theme=dark'],
  ])('only spaces and tabs are trimmed, on every path: %s', (_, cookie) => {
    const prefs = definePrefs({ theme: pref.enum(['light', 'dark']).default('light').reflect('data-theme') });
    fakeCookie(cookie);
    expect(scriptState(prefs).attrs).toEqual({ 'data-theme': 'light' });
    expect(reapplyState(prefs)).toEqual(scriptState(prefs));
    expect(storeState(prefs)).toEqual(scriptState(prefs));
    expect(prefs.theme.get()).toBe('light');
    expect(readPrefs(prefs, cookie)).toEqual({ theme: 'light' });
    expect(readPrefs(prefs, snapshotPrefs(prefs, cookie))).toEqual({ theme: 'light' });
    // spaces and tabs, which browsers never leave in `document.cookie`, are trimmed on the server
    expect(readPrefs(prefs, ' \t theme \t= \t dark \t;')).toEqual({ theme: 'dark' });
  });

  it('a nameless cookie that looks like `name=value` is that cookie on every path', () => {
    // A cookie with an empty name shows up as its bare value. One whose value is
    // `theme=dark` cannot be told apart from a real `theme` cookie, by anyone.
    const prefs = make();
    fakeCookie('theme=dark');
    expect(prefs.theme.get()).toBe('dark');
    expect(scriptState(prefs).attrs['data-theme']).toBe('dark');
    // a bare value is never a cookie of that name
    fakeCookie('sidebar; theme2; label');
    expect(readPrefs(prefs, document.cookie)).toMatchObject({ sidebar: true, theme2: undefined, label: undefined });
    expect(scriptState(prefs).attrs).toMatchObject({ 'data-sidebar': 'true' });
    expect(scriptState(prefs).attrs).not.toHaveProperty('data-label');
  });

  it('never lets one pref read another whose name contains it', () => {
    const prefs = make();
    for (const cookie of ['xtheme=dark', 'theme2=true', 'themes=dark', 'app.theme=dark', 'xtheme=dark; theme2=dark']) {
      fakeCookie(cookie);
      expect(prefs.theme.get(), cookie).toBe('system');
      expect(scriptState(prefs).attrs['data-theme'], cookie).toBe('system');
      expect(prefs.theme.read(cookie), cookie).toBe('system');
    }
    fakeCookie('theme2=true; xtheme=t; theme=dark');
    expect(readPrefs(prefs, document.cookie)).toMatchObject({ theme: 'dark', theme2: true, xtheme: 't' });
  });

  it('decodes exactly once, keeps `+`, and never normalises unicode', () => {
    const { s } = definePrefs({ s: pref.string().reflect('data-s') });
    const e = definePrefs({ e: pref.enum(['é']).reflect('data-e') }).e;
    const cases: [string, string | undefined][] = [
      ['s=%2520', '%20'],
      ['s=%252525', '%2525'],
      ['s=a+b', 'a+b'],
      ['s=a%2Bb', 'a+b'],
      ['s=%22%22', '""'],
      ['s=%00', '\0'],
      ['s=e%CC%81', 'e\u0301'],
      ['s=%ED%A0%80', undefined], // an encoded lone surrogate is malformed UTF-8
    ];
    for (const [cookie, expected] of cases) {
      fakeCookie(cookie);
      expect(s.get(), cookie).toBe(expected);
      expect(s.read(cookie), cookie).toBe(expected);
      resetHtml();
      new Function(prefsScript({ s }))();
      expect(html.getAttribute('data-s'), cookie).toBe(expected ?? null);
    }
    fakeCookie('e=e%CC%81');
    expect(e.get()).toBeUndefined();
    fakeCookie('e=%C3%A9');
    expect(e.get()).toBe('é');
  });
});

describe('cookies named like Object.prototype members', () => {
  it('are plain cookies on the client, in the script and on the server', () => {
    const prefs = definePrefs({
      a: pref.string().options({ name: 'constructor' }).reflect('data-a'),
      b: pref.enum(['x', 'y']).default('x').options({ name: 'toString' }).reflect('data-b'),
      c: pref.boolean().default(false).options({ name: 'hasOwnProperty' }).reflect('data-c'),
    });
    fakeCookie('');
    expect(readPrefs(prefs, '')).toEqual({ a: undefined, b: 'x', c: false });
    expect(readPrefs(prefs, {})).toEqual({ a: undefined, b: 'x', c: false });
    expect(snapshotPrefs(prefs, '')).toEqual({});
    expect(scriptState(prefs).attrs).toEqual({ 'data-b': 'x', 'data-c': 'false' });

    const cookie = 'constructor=v; toString=y; hasOwnProperty=true';
    fakeCookie(cookie);
    const values = { a: 'v', b: 'y', c: true };
    expect(readPrefs(prefs, cookie)).toEqual(values);
    expect(readPrefs(prefs, snapshotPrefs(prefs, cookie))).toEqual(values);
    expect(Object.keys(snapshotPrefs(prefs, cookie))).toEqual(['constructor', 'toString', 'hasOwnProperty']);
    expect(scriptState(prefs).attrs).toEqual({ 'data-a': 'v', 'data-b': 'y', 'data-c': 'true' });
    expect(storeState(prefs)).toEqual(scriptState(prefs));
  });

  it('do not pick up inherited members from a plain map or a snapshot', () => {
    const prefs = definePrefs({
      a: pref.string().options({ name: 'constructor' }),
      b: pref.string().default('d').options({ name: 'valueOf' }),
    });
    expect(readPrefs(prefs, {})).toEqual({ a: undefined, b: 'd' });
    expect(readPrefs(prefs, Object.create({ constructor: 'inherited' }))).toEqual({ a: 'inherited', b: 'd' });
  });

  it('a cookie named `__proto__` is kept in snapshots and read back from them', () => {
    const prefs = definePrefs({ p: pref.string().options({ name: '__proto__' }).reflect('data-p') });
    const cookie = '__proto__=x';
    expect(readPrefs(prefs, cookie)).toEqual({ p: 'x' });
    const snapshot = snapshotPrefs(prefs, cookie);
    expect(Object.keys(snapshot)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(snapshot)).toBe(Object.prototype);
    expect(readPrefs(prefs, snapshot)).toEqual({ p: 'x' });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    fakeCookie(cookie);
    expect(prefs.p.get()).toBe('x');
    expect(scriptState(prefs).attrs).toEqual({ 'data-p': 'x' });
    expect(storeState(prefs)).toEqual(scriptState(prefs));
  });

  it('a pref keyed `__proto__` is a handle like any other', () => {
    const prefs = definePrefs({ ['__proto__']: pref.string().reflect('data-p'), other: pref.string() });
    expect(Object.keys(prefs)).toEqual(['__proto__', 'other']);
    expect(Object.getPrototypeOf(prefs)).toBe(Object.prototype);
    expect(prefs['__proto__']!.name).toBe('__proto__');
    expect(readPrefs(prefs, '__proto__=x; other=1')).toEqual({ ['__proto__']: 'x', other: '1' });
    expect(Object.keys(readPrefs(prefs, ''))).toEqual(['__proto__', 'other']);
    expect(prefsScript(prefs)).toContain('data-p');
  });

  it('keys inherited from a polluted Object.prototype are not prefs', () => {
    const proto = Object.prototype as Record<string, unknown>;
    proto.polluted = pref.string();
    try {
      const prefs = definePrefs({ theme: pref.enum(['light', 'dark']).default('light') });
      expect(Object.keys(prefs)).toEqual(['theme']);
      expect(readPrefs(prefs, 'polluted=1')).toEqual({ theme: 'light' });
      expect(Object.keys(snapshotPrefs(prefs, 'theme=dark; polluted=1'))).toEqual(['theme']);
    } finally {
      delete proto.polluted;
    }
  });
});

describe('round trips through the browser cookie', () => {
  const next = random(0x56);

  /** Strings from every awkward character class: separators, controls, quotes, non-BMP, combining marks. */
  const classes = [
    ' ;=,"\'\\%+&<>/?#',
    '\0\u0001\t\n\r\u001f\u007f',
    '\u00a0\u2028\u2029\ufeff\u200b',
    'aZ09-_.~!*()',
    'éßøЖ中文',
    '\u0301\u0308',
  ];
  const randomString = (max: number) => {
    let s = '';
    for (let n = Math.floor(next() * max); n-- > 0; ) {
      const r = next();
      if (r < 0.06) s += '😀';
      else s += pick(next, [...pick(next, classes)]);
    }
    return s;
  };

  it('string: set() then get() gives back every well-formed string', () => {
    const { s } = definePrefs({ s: pref.string() });
    const samples = ['', ' ', ' padded ', '"quoted"', '%', '%25', '+', '\0', 'a'.repeat(1000)];
    for (let i = 0; i < 300; i++) samples.push(randomString(40));
    for (const value of samples) {
      s.set(value);
      expect(s.get(), JSON.stringify(value)).toBe(value);
      // the server reads the header the browser sends
      expect(s.read(document.cookie), JSON.stringify(value)).toBe(value);
    }
  });

  it('string: toCookie() encoded by a framework reads back on the server', () => {
    const { s } = definePrefs({ s: pref.string() });
    for (let i = 0; i < 300; i++) {
      const value = randomString(40);
      const { name, value: raw } = s.toCookie(value);
      // what Next.js, Express (`cookie`) and `encodeURIComponent` by hand all send
      const header = `other=1; ${name}=${encodeURIComponent(raw)}; last=2`;
      expect(s.read(header), JSON.stringify(value)).toBe(value);
      expect(s.read({ [name]: raw }), JSON.stringify(value)).toBe(value);
    }
  });

  it('number: every finite double but -0 round-trips exactly', () => {
    const { n } = definePrefs({ n: pref.number().default(7) });
    const view = new DataView(new ArrayBuffer(8));
    const samples = [0, 1e21, 0.1 + 0.2, 5e-324, -5e-324, Number.MAX_VALUE, -Number.MAX_VALUE, 2 ** 53 + 2, 1e-7, 123e-20];
    for (let i = 0; i < 300; i++) {
      // random bit patterns cover every exponent
      view.setUint32(0, Math.floor(next() * 2 ** 32));
      view.setUint32(4, Math.floor(next() * 2 ** 32));
      const v = view.getFloat64(0);
      if (Number.isFinite(v) && !Object.is(v, -0)) samples.push(v);
    }
    for (const value of samples) {
      n.set(value);
      expect(Object.is(n.get(), value), `${value}`).toBe(true);
      expect(Object.is(n.read(document.cookie), value), `${value}`).toBe(true);
      expect(Object.is(n.read({ n: n.toCookie(value).value }), value), `${value}`).toBe(true);
    }
  });

  it('number: values that are not finite read as the default after set()', () => {
    const { n } = definePrefs({ n: pref.number().default(7) });
    for (const value of [NaN, Infinity, -Infinity]) {
      n.set(9);
      n.set(value);
      expect(n.get()).toBe(7);
    }
  });

  it('enum and boolean: every value round-trips, also with hostile enum values', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const values = ['', ' ', 'a;b', 'a=b', '"q"', '%', '%25', '__proto__', 'toString', '</script>', '\u2028', '😀', 'e\u0301'] as const;
    const { e, b } = definePrefs({
      e: pref.enum(values).reflect('data-e'),
      b: pref.boolean().reflect('data-b'),
    });
    vi.unstubAllEnvs();
    for (const value of values) {
      e.set(value);
      expect(e.get(), JSON.stringify(value)).toBe(value);
      expect(e.read(document.cookie)).toBe(value);
      resetHtml();
      new Function(prefsScript({ e }))();
      expect(html.getAttribute('data-e'), JSON.stringify(value)).toBe(value);
    }
    for (const value of [true, false]) {
      b.set(value);
      expect(b.get()).toBe(value);
      b.set((prev) => !prev);
      expect(b.get()).toBe(!value);
    }
  });

  it('json: a transforming, defaulting schema writes input and reads output', () => {
    const schema = z.object({
      tags: z.array(z.string()).default([]),
      at: z.string().transform((s) => s.length),
    });
    const { j } = definePrefs({ j: pref.json(schema).default({ tags: ['d'], at: 0 }) });
    j.set({ at: 'abc' });
    expect(j.get()).toEqual({ tags: [], at: 3 });
    // JSON.stringify escapes lone surrogates, so json prefs keep them (string prefs cannot)
    const tags = ['a;b', '</script>', '\u2028', '😀'.slice(1), '\ud800'];
    j.set({ tags, at: '' });
    expect(j.get()).toEqual({ tags, at: 0 });
    expect(j.read(document.cookie)).toEqual(j.get());
  });

  it('json: values JSON cannot represent come back as JSON makes them', () => {
    const { j } = definePrefs({ j: pref.json(z.array(z.unknown())).default([]) });
    j.set([NaN, Infinity, undefined, () => 1, new Date(0), -0]);
    expect(j.get()).toEqual([null, null, null, null, '1970-01-01T00:00:00.000Z', 0]);
  });

  it('custom: a codec that stores anything round-trips', () => {
    const { d } = definePrefs({
      d: pref.custom<Date>({
        parse: (raw) => {
          const date = new Date(raw);
          return isNaN(+date) ? undefined : date;
        },
        serialize: (date) => date.toISOString(),
      }),
    });
    d.set(new Date(Date.UTC(2026, 10, 17)));
    expect(d.get()?.toISOString()).toBe('2026-11-17T00:00:00.000Z');
    document.cookie = 'd=garbage';
    expect(d.get()).toBeUndefined();
  });
});
