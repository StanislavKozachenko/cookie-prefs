import { afterEach, expect, it, vi } from 'vitest';
import { definePrefs, pref } from '../../index';

const clearCookies = () => {
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
};

afterEach(clearCookies);

/** Run `fn` with timers held back, then run them: what each timer threw, in order. */
const deferredErrors = (fn: () => void) => {
  const timers: (() => void)[] = [];
  const spy = vi
    .spyOn(globalThis, 'setTimeout')
    .mockImplementation(((callback: () => void) => timers.push(callback)) as never);
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return timers.map((timer) => {
    try {
      timer();
    } catch (e) {
      return e;
    }
  });
};

it('a throwing listener neither fails set() nor starves the listeners after it', () => {
  const { theme } = definePrefs({ theme: pref.enum(['light', 'dark']).default('light') });
  const error = new Error('analytics is down');
  const other = vi.fn();
  const off1 = theme.subscribe(() => {
    throw error;
  });
  const off2 = theme.subscribe(other);
  const errors = deferredErrors(() => {
    expect(() => theme.set('dark')).not.toThrow();
    expect(() => theme.reset()).not.toThrow();
  });
  expect(theme.get()).toBe('light');
  expect(other.mock.calls).toEqual([['dark'], ['light']]);
  // not swallowed: each error is thrown again from a timer, so it reaches window.onerror
  expect(errors).toEqual([error, error]);
  off1();
  off2();
});

it('a throwing listener does not stop the cross-tab re-check of other prefs', () => {
  const store = new EventTarget();
  vi.stubGlobal('cookieStore', store);
  try {
    const prefs = definePrefs({
      theme: pref.enum(['light', 'dark']).default('light'),
      sidebar: pref.boolean().default(true),
    });
    const off1 = prefs.theme.subscribe(() => {
      throw new Error('analytics is down');
    });
    const listener = vi.fn();
    const off2 = prefs.sidebar.subscribe(listener);
    // another tab writes both cookies
    document.cookie = 'theme=dark';
    document.cookie = 'sidebar=false';
    const errors = deferredErrors(() => store.dispatchEvent(new Event('change')));
    expect(listener).toHaveBeenCalledWith(false);
    expect(errors).toHaveLength(1);
    off1();
    off2();
  } finally {
    vi.unstubAllGlobals();
  }
});
