'use client';

import { useMemo, useSyncExternalStore, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { usePref } from 'cookie-prefs/react';
import { prefs } from '../app/prefs';
import { pickCookies } from '../lib/format';
import { PREF_KEYS, type DemoPrefs, type PrefKey } from '../lib/options';
import { DemoContext, type DemoState } from './demo-state';

const NAMES = PREF_KEYS.map((key) => prefs[key].name);

// Every pref's `subscribe` fires when its cookie changes, here or in another tab.
const subscribe = (onChange: () => void) => {
  const stops = PREF_KEYS.map((key) => prefs[key].subscribe(onChange));
  return () => stops.forEach((stop) => stop());
};
const readCookies = () => pickCookies(document.cookie, NAMES);

/** These prefs re-render server output (the table), so a write is followed by `router.refresh()`. */
const SERVER_RENDERED: readonly PrefKey[] = ['pageSize', 'locale'];

const parse = (pairs: string): Partial<Record<PrefKey, string | null>> => {
  const stored: Partial<Record<PrefKey, string | null>> = {};
  for (const key of PREF_KEYS) {
    const pair = pairs.split('; ').find((p) => p.startsWith(prefs[key].name + '='));
    stored[key] = pair ?? null;
  }
  return stored;
};

/**
 * Preference state from cookie-prefs. `usePref` renders the request's cookie values
 * during SSR (`mode="server"`), so the first HTML is already right.
 */
export function CookieState({ serverCookies, children }: { serverCookies: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [theme] = usePref(prefs.theme);
  const [sidebar] = usePref(prefs.sidebar);
  const [density] = usePref(prefs.density);
  const [pageSize] = usePref(prefs.pageSize);
  const [locale] = usePref(prefs.locale);
  // The server passes the cookies it received, so hydration renders the same text.
  const cookies = useSyncExternalStore(subscribe, readCookies, () => serverCookies);

  const state = useMemo<DemoState>(() => {
    const values: DemoPrefs = { theme, sidebar, density, pageSize, locale };
    return {
      variant: 'cookie',
      values,
      pending,
      stored: parse(cookies),
      set: (key, value) => {
        (prefs[key].set as (value: DemoPrefs[typeof key]) => void)(value);
        if (SERVER_RENDERED.includes(key)) startTransition(() => router.refresh());
      },
    };
  }, [theme, sidebar, density, pageSize, locale, pending, cookies, router]);

  return <DemoContext.Provider value={state}>{children}</DemoContext.Provider>;
}
