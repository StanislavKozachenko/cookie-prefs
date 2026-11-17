'use client';

import { useEffect, useState } from 'react';
import { usePref } from 'cookie-prefs/react';
import { prefs, shortPrefs } from '../prefs';
import { fmt } from '../lib/fmt';

export function PrefsPanel() {
  const [theme, setTheme] = usePref(prefs.theme);
  const [sidebar, setSidebar] = usePref(prefs.sidebar);
  const [density, setDensity] = usePref(prefs.density);
  const [pageSize, setPageSize] = usePref(prefs.pageSize);
  const [locale, setLocale] = usePref(prefs.locale);
  const [columns, setColumns] = usePref(prefs.columns);
  const [recent, setRecent] = usePref(shortPrefs.recent);
  const [hydrated, setHydrated] = useState('no');
  useEffect(() => setHydrated('yes'), []);

  return (
    <section>
      <h2>Client prefs</h2>
      <p>hydrated: <span data-testid="hydrated">{hydrated}</span></p>
      <p>theme: <span data-testid="theme">{fmt(theme)}</span></p>
      <p>sidebar: <span data-testid="sidebar">{fmt(sidebar)}</span></p>
      <p>density: <span data-testid="density">{fmt(density)}</span></p>
      <p>pageSize: <span data-testid="pageSize">{fmt(pageSize)}</span></p>
      <p>locale: <span data-testid="locale">{fmt(locale)}</span></p>
      <p>recent: <span data-testid="recent">{fmt(recent)}</span></p>
      <p>columns: <span data-testid="columns">{fmt(columns)}</span></p>

      <button data-testid="set-theme-dark" onClick={() => setTheme('dark')}>dark</button>
      <button data-testid="set-theme-light" onClick={() => setTheme('light')}>light</button>
      <button data-testid="reset-theme" onClick={() => prefs.theme.reset()}>reset theme</button>
      <button data-testid="toggle-sidebar" onClick={() => setSidebar((open) => !open)}>toggle sidebar</button>
      <button data-testid="reset-sidebar" onClick={() => prefs.sidebar.reset()}>reset sidebar</button>
      <button data-testid="set-density-compact" onClick={() => setDensity('compact')}>compact</button>
      <button data-testid="reset-density" onClick={() => prefs.density.reset()}>reset density</button>
      <button data-testid="inc-pageSize" onClick={() => setPageSize((n) => n + 5)}>page size +5</button>
      <button data-testid="reset-pageSize" onClick={() => prefs.pageSize.reset()}>reset page size</button>
      <button data-testid="set-locale-fr" onClick={() => setLocale('fr')}>fr</button>
      <button data-testid="reset-locale" onClick={() => prefs.locale.reset()}>reset locale</button>
      <button data-testid="set-recent" onClick={() => setRecent('x')}>recent</button>
      <button data-testid="set-columns" onClick={() => setColumns(['a', 'b'])}>columns a,b</button>
      <button data-testid="reset-columns" onClick={() => prefs.columns.reset()}>reset columns</button>
    </section>
  );
}
