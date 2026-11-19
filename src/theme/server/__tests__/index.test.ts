import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ThemeProviderProps } from '../../index';
import * as entry from '../index';
import { readTheme } from '../index';

it('exports readTheme only', () => {
  expect(Object.keys(entry)).toEqual(['readTheme']);
});

describe('readTheme', () => {
  it('reads the stored theme from a Cookie header', () => {
    expect(readTheme('a=1; theme=dark; b=2')).toBe('dark');
    expect(readTheme('theme=light')).toBe('light');
  });

  it('returns system as is', () => {
    expect(readTheme('theme=system')).toBe('system');
    expect(readTheme(null)).toBe('system');
  });

  it('reads an unlisted, empty or malformed value as the default', () => {
    for (const header of ['theme=blue', 'theme=', 'theme', 'theme=%E0%A4%A', 'theme=__proto__', 'theme=toString', ''])
      expect(readTheme(header, { defaultTheme: 'dark' }), header).toBe('dark');
    expect(readTheme(undefined, { defaultTheme: 'dark' })).toBe('dark');
  });

  it('parses the header like the browser: first duplicate wins, quotes stripped, URI-decoded', () => {
    expect(readTheme('theme=light; theme=dark')).toBe('light');
    expect(readTheme('theme="dark"')).toBe('dark');
    expect(readTheme('theme=%64ark')).toBe('dark');
  });

  it('takes cookie stores and plain maps, with decoded values', () => {
    const store = new Map([['theme', { value: 'dark' }]]);
    expect(readTheme(store)).toBe('dark');
    expect(readTheme({ theme: 'light' })).toBe('light');
    expect(readTheme({ theme: 'blue' })).toBe('system');
  });

  it('has the provider defaults', () => {
    expect(readTheme('', { enableSystem: false })).toBe('light');
    expect(readTheme('theme=system', { enableSystem: false })).toBe('light');
    expect(readTheme('theme=dark', { enableSystem: false })).toBe('dark');
    // the default is returned as is, listed or not, like the provider
    expect(readTheme('theme=red', { themes: ['red', 'blue'], enableSystem: false })).toBe('red');
    expect(readTheme('', { themes: ['red', 'blue'], enableSystem: false })).toBe('light');
  });

  it('accepts custom themes and the keys of value', () => {
    expect(readTheme('theme=sepia', { themes: ['light', 'sepia'] })).toBe('sepia');
    expect(readTheme('theme=dark', { themes: ['light', 'sepia'] })).toBe('system');
    expect(readTheme('theme=pink', { value: { pink: 'my-pink-theme' } })).toBe('pink');
  });

  it('reads the cookie named storageKey, URI-encoded', () => {
    expect(readTheme('theme=light; my%20theme=dark', { storageKey: 'my theme' })).toBe('dark');
    expect(readTheme('my theme=dark', { storageKey: 'my theme' })).toBe('system');
  });

  it('ignores forcedTheme and the other provider props', () => {
    const props: ThemeProviderProps = {
      attribute: 'class',
      forcedTheme: 'dark',
      cookie: { domain: 'example.com' },
      nonce: 'n',
    };
    expect(readTheme('theme=light', props)).toBe('light');
  });

  it('never throws on a hostile header', () => {
    expect(readTheme('theme=' + '%'.repeat(10000))).toBe('system');
    expect(readTheme(' '.repeat(100000) + 'x')).toBe('system');
  });
});

it('imports only the core, by package name', () => {
  const source = readFileSync('src/theme/server/index.ts', 'utf8');
  expect(source.match(/from '[^']*'/g)).toEqual(["from 'cookie-prefs'"]);
});
