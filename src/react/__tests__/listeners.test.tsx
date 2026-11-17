import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { definePrefs, pref } from '../../index';
import { usePref } from '../index';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  document.cookie = 'theme=; Max-Age=0; Path=/';
  vi.restoreAllMocks();
});

it('a throwing subscriber registered before React does not freeze usePref', () => {
  const { theme } = definePrefs({ theme: pref.enum(['light', 'dark']).default('light') });
  // e.g. module-level analytics, subscribed before React mounts
  const error = new Error('analytics is down');
  const offRaw = theme.subscribe(() => {
    throw error;
  });
  const timers: (() => void)[] = [];
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => timers.push(callback)) as never);
  const Show = () => <p>{usePref(theme)[0]}</p>;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Show />));
  expect(container.textContent).toBe('light');
  act(() => theme.set('dark'));
  expect(container.textContent).toBe('dark');
  act(() => root.unmount());
  offRaw();
  // the error is thrown again from a timer, held back here
  expect(timers).toHaveLength(1);
  expect(timers[0]).toThrow(error);
});
