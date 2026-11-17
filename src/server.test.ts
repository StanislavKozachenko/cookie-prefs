// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { definePrefs, pref, prefsScript, readPrefs, snapshotPrefs } from './index';

const prefs = definePrefs({
  theme: pref.enum(['light', 'dark']).default('light').reflect('class'),
  locale: pref.string(),
});

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('without a DOM', () => {
  it('runs in an environment with no document', () => {
    expect(typeof document).toBe('undefined');
  });

  it('get() returns the default', () => {
    expect(prefs.theme.get()).toBe('light');
    expect(prefs.locale.get()).toBeUndefined();
  });

  it('get() warns once per pref in development, pointing to read()', () => {
    const { a, b } = definePrefs({ a: pref.string(), b: pref.string() });
    a.get();
    a.get();
    b.get();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toMatch(/a\.get\(\).*read\(\)/);
  });

  it('get() does not warn in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    definePrefs({ a: pref.string() }).a.get();
    expect(warn).not.toHaveBeenCalled();
  });

  it('set() and reset() are no-ops and do not run updaters', () => {
    const updater = vi.fn(() => 'dark' as const);
    expect(() => prefs.theme.set('dark')).not.toThrow();
    expect(() => prefs.theme.set(updater)).not.toThrow();
    expect(() => prefs.theme.reset()).not.toThrow();
    expect(updater).not.toHaveBeenCalled();
    expect(prefs.theme.get()).toBe('light');
  });

  it('subscribe() opens no channel and returns an unsubscribe', () => {
    const Channel = vi.fn();
    vi.stubGlobal('BroadcastChannel', Channel);
    const off = prefs.theme.subscribe(() => {});
    expect(Channel).not.toHaveBeenCalled();
    expect(off).not.toThrow();
  });

  it('reads request cookies', () => {
    expect(prefs.theme.read('theme=dark')).toBe('dark');
    expect(readPrefs(prefs, 'theme=dark; locale=de')).toEqual({ theme: 'dark', locale: 'de' });
    expect(snapshotPrefs(prefs, 'theme=dark; other=1')).toEqual({ theme: 'dark' });
  });

  it('builds cookies and the inline script', () => {
    expect(prefs.locale.toCookie('de')).toMatchObject({ name: 'locale', value: 'de' });
    expect(prefsScript(prefs)).toContain('\\"theme\\"');
  });
});
