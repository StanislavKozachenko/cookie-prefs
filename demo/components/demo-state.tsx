'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';
import type { DemoPrefs, PrefKey } from '../lib/options';

export type Variant = 'cookie' | 'local';

/**
 * What the shared UI needs from a preference store. The two pages differ only in the
 * provider that fills it: `CookieState` (cookie-prefs) or `LocalState` (localStorage).
 */
export interface DemoState {
  variant: Variant;
  values: DemoPrefs;
  set: <K extends PrefKey>(key: K, value: DemoPrefs[K]) => void;
  /** A server re-render of the table is in flight (cookie version only). */
  pending: boolean;
  /**
   * Raw stored entries, per pref: the cookie as `document.cookie` holds it, or the
   * localStorage item; `null` when the pref is not stored. `undefined` while it cannot
   * be known yet (the server render of the localStorage page).
   */
  stored: Partial<Record<PrefKey, string | null>> | undefined;
}

export const DemoContext = createContext<DemoState | null>(null);

export const useDemo = (): DemoState => {
  const state = useContext(DemoContext);
  if (!state) throw new Error('useDemo needs a CookieState or LocalState provider');
  return state;
};

const noop = () => () => {};

/** `false` during SSR and hydration, `true` after. */
export const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
