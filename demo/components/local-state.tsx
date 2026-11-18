'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULTS, DENSITIES, LOCALES, PREF_KEYS, THEMES, type DemoPrefs, type PrefKey, type Theme } from '../lib/options';
import { DemoContext, type DemoState } from './demo-state';

// The conventional approach: preferences in localStorage, React state that starts at
// the defaults (the server cannot know better) and is corrected after hydration.
// Only the theme avoids the flash, through the blocking script in the layout, the way
// next-themes does it.

const oneOf = <T,>(list: readonly T[], raw: string | null): T | undefined => list.find((v) => String(v) === raw);

const readStored = (): DemoPrefs => {
  const get = (key: PrefKey) => localStorage.getItem(key);
  const pageSize = Number(get('pageSize'));
  return {
    theme: oneOf(THEMES, get('theme')) ?? DEFAULTS.theme,
    sidebar: get('sidebar') === null ? DEFAULTS.sidebar : get('sidebar') === 'true',
    density: oneOf(DENSITIES, get('density')) ?? DEFAULTS.density,
    pageSize: get('pageSize') !== null && Number.isFinite(pageSize) ? pageSize : DEFAULTS.pageSize,
    locale: oneOf(LOCALES, get('locale')) ?? DEFAULTS.locale,
  };
};

const readEntries = () =>
  Object.fromEntries(PREF_KEYS.map((key) => [key, localStorage.getItem(key)])) as Record<PrefKey, string | null>;

export const applyTheme = (theme: Theme) => {
  const classes = document.documentElement.classList;
  classes.remove(...THEMES);
  classes.add(theme);
};

export function LocalState({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<DemoPrefs>(DEFAULTS);
  const [stored, setStored] = useState<Record<PrefKey, string | null>>();

  // Load the stored preferences once hydrated, and follow other tabs.
  useEffect(() => {
    const load = () => {
      try {
        setValues(readStored());
        setStored(readEntries());
      } catch {
        // storage blocked: keep the defaults
      }
    };
    load();
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      load();
      if (event.key === 'theme' || event.key === null) applyTheme(readStored().theme);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Mirror the state on <html>, where the shared CSS reads it.
  useEffect(() => {
    document.documentElement.dataset.sidebar = String(values.sidebar);
  }, [values.sidebar]);
  useEffect(() => {
    document.documentElement.dataset.density = values.density;
  }, [values.density]);

  const state = useMemo<DemoState>(
    () => ({
      variant: 'local',
      values,
      pending: false,
      stored,
      set: (key, value) => {
        try {
          localStorage.setItem(key, String(value));
          setStored(readEntries());
        } catch {
          // storage blocked: the change lasts until reload
        }
        if (key === 'theme') applyTheme(value as Theme);
        setValues((current) => ({ ...current, [key]: value }));
      },
    }),
    [values, stored],
  );

  return <DemoContext.Provider value={state}>{children}</DemoContext.Provider>;
}
