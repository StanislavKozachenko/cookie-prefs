import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { rawOf } from '../cookie';
import { definePrefs, pref, readPrefs, snapshotPrefs } from '../../index';

describe('rawOf: Cookie header', () => {
  it('finds a cookie among others', () => {
    expect(rawOf('a=1; theme=dark; b=2', 'theme')).toBe('dark');
    expect(rawOf('theme=dark', 'theme')).toBe('dark');
  });

  it('tolerates spaces around names, values and separators', () => {
    expect(rawOf('a=1;theme=dark', 'theme')).toBe('dark');
    expect(rawOf('  a = 1 ;  theme =  dark  ', 'theme')).toBe('dark');
  });

  it('strips double quotes around the value', () => {
    expect(rawOf('theme="dark"', 'theme')).toBe('dark');
    expect(rawOf('theme="', 'theme')).toBe('"');
  });

  it('takes the first of duplicate cookies', () => {
    expect(rawOf('theme=dark; theme=light', 'theme')).toBe('dark');
  });

  it('matches the whole name only', () => {
    expect(rawOf('xtheme=dark; themex=dark', 'theme')).toBeUndefined();
    expect(rawOf('app.theme=dark', 'theme')).toBeUndefined();
  });

  it('decodes values and keeps "=" inside them', () => {
    expect(rawOf('locale=de%20AT', 'locale')).toBe('de AT');
    expect(rawOf('q=a=b', 'q')).toBe('a=b');
  });

  it('returns undefined for a missing cookie, empty header or nameless pairs', () => {
    expect(rawOf('', 'theme')).toBeUndefined();
    expect(rawOf('=dark; theme', 'theme')).toBeUndefined();
  });

  it('throws on malformed encoding (handles turn it into the default)', () => {
    expect(() => rawOf('locale=%E0%A4%A', 'locale')).toThrow();
  });
});

describe('reading from each source kind', () => {
  const prefs = definePrefs({
    theme: pref.enum(['light', 'dark']).default('light'),
    locale: pref.string(),
  });

  it('reads a Cookie header', () => {
    expect(readPrefs(prefs, 'theme=dark; locale=de%2DAT')).toEqual({ theme: 'dark', locale: 'de-AT' });
  });

  it('reads a cookie store with get(name), keeping its `this`', () => {
    class Store {
      private map = new Map([['theme', { name: 'theme', value: 'dark' }]]);
      get(name: string) {
        return this.map.get(name);
      }
    }
    expect(readPrefs(prefs, new Store())).toEqual({ theme: 'dark', locale: undefined });
  });

  it('reads a plain map of already decoded values', () => {
    expect(readPrefs(prefs, { theme: 'dark', locale: '100%' })).toEqual({
      theme: 'dark',
      locale: '100%',
    });
    expect(readPrefs(prefs, { theme: undefined })).toEqual({ theme: 'light', locale: undefined });
  });

  it('reads null and undefined as no cookies', () => {
    expect(readPrefs(prefs, null)).toEqual({ theme: 'light', locale: undefined });
    expect(readPrefs(prefs, undefined)).toEqual({ theme: 'light', locale: undefined });
  });

  it('never throws on malformed, oversized or odd input', () => {
    expect(prefs.locale.read('locale=%E0%A4%A')).toBeUndefined();
    expect(prefs.locale.read({ locale: 'x'.repeat(4097) })).toBeUndefined();
    expect(prefs.locale.read({ locale: 'x'.repeat(4096) })).toHaveLength(4096);
    expect(prefs.locale.read({ locale: 42 } as never)).toBeUndefined();
    const throwing = {
      get() {
        throw new Error('boom');
      },
    };
    expect(prefs.theme.read(throwing)).toBe('light');
  });

  it('round-trips encoded json through a header', () => {
    const { cols } = definePrefs({ cols: pref.json(z.array(z.string())).default([]) });
    const header = `cols=${encodeURIComponent(JSON.stringify(['a;b', '100%', 'é']))}`;
    expect(cols.read(header)).toEqual(['a;b', '100%', 'é']);
  });
});

describe('cookie names', () => {
  it('uses prefix + key, or the name option without the prefix', () => {
    const prefs = definePrefs(
      { theme: pref.string(), sidebar: pref.boolean().options({ name: 'sb' }) },
      { prefix: 'app.' },
    );
    expect(prefs.theme.key).toBe('theme');
    expect(prefs.theme.name).toBe('app.theme');
    expect(prefs.sidebar.name).toBe('sb');
    expect(readPrefs(prefs, 'theme=x; app.theme=y; sb=true; app.sidebar=false')).toEqual({
      theme: 'y',
      sidebar: true,
    });
  });

  it('encodes names that are not cookie-safe', () => {
    const { a } = definePrefs({ a: pref.string().options({ name: 'my pref' }) });
    expect(a.name).toBe('my%20pref');
    expect(a.read('my%20pref=v')).toBe('v');
  });
});

describe('toCookie', () => {
  it('uses the default attributes and leaves Secure unset', () => {
    const { locale } = definePrefs({ locale: pref.string() });
    expect(locale.toCookie('de')).toEqual({
      name: 'locale',
      value: 'de',
      path: '/',
      maxAge: 34560000,
      sameSite: 'lax',
    });
  });

  it('applies set options, then pref options', () => {
    const prefs = definePrefs(
      {
        a: pref.string(),
        b: pref.string().options({ name: 'bee', maxAge: 60, sameSite: 'strict', secure: false }),
      },
      { prefix: '__Host-', secure: true, sameSite: 'none', domain: 'x.test', partitioned: true },
    );
    expect(prefs.a.toCookie('1')).toEqual({
      name: '__Host-a',
      value: '1',
      path: '/',
      maxAge: 34560000,
      sameSite: 'none',
      secure: true,
      domain: 'x.test',
      partitioned: true,
    });
    expect(prefs.b.toCookie('2')).toEqual({
      name: 'bee',
      value: '2',
      path: '/',
      maxAge: 60,
      sameSite: 'strict',
      secure: false,
      domain: 'x.test',
      partitioned: true,
    });
  });

  it('returns the unencoded value, for frameworks that encode on set', () => {
    const { s } = definePrefs({ s: pref.string() });
    expect(s.toCookie('a b').value).toBe('a b');
  });
});

describe('snapshotPrefs', () => {
  const prefs = definePrefs(
    { theme: pref.enum(['light', 'dark']).default('light'), locale: pref.string() },
    { prefix: 'p.' },
  );

  it('copies only the prefs’ own cookies, decoded and keyed by name', () => {
    expect(snapshotPrefs(prefs, 'session=secret; p.theme=dark; p.locale=a%20b')).toEqual({
      'p.theme': 'dark',
      'p.locale': 'a b',
    });
  });

  it('keeps invalid raw values (the client reads them as the default) and skips malformed ones', () => {
    const snapshot = snapshotPrefs(prefs, 'p.theme=blue; p.locale=%E0%A4%A');
    expect(snapshot).toEqual({ 'p.theme': 'blue' });
    expect(readPrefs(prefs, snapshot)).toEqual({ theme: 'light', locale: undefined });
  });

  it('is readable back as a source', () => {
    const snapshot = snapshotPrefs(prefs, { 'p.theme': 'dark' });
    expect(prefs.theme.read(snapshot)).toBe('dark');
  });
});
