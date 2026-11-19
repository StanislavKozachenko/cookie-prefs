import { useEffect, useState } from 'react';
import { usePref } from 'cookie-prefs/react';
import type { PrefValues } from 'cookie-prefs';
import { prefs } from './prefs';

/** Values a route loader read on the server with `readPrefs`. */
export function ServerValues({ values }: { values: PrefValues<typeof prefs> }) {
  return (
    <section>
      <h2>Loader (readPrefs)</h2>
      <p>theme: <span data-testid="loader-theme">{values.theme}</span></p>
      <p>sidebar: <span data-testid="loader-sidebar">{String(values.sidebar)}</span></p>
      <p>density: <span data-testid="loader-density">{values.density}</span></p>
      <p>pageSize: <span data-testid="loader-pageSize">{values.pageSize}</span></p>
    </section>
  );
}

export function PrefsPanel() {
  const [theme, setTheme] = usePref(prefs.theme);
  const [sidebar, setSidebar] = usePref(prefs.sidebar);
  const [density, setDensity] = usePref(prefs.density);
  const [pageSize, setPageSize] = usePref(prefs.pageSize);
  const [hydrated, setHydrated] = useState('no');
  useEffect(() => setHydrated('yes'), []);

  return (
    <section>
      <h2>Hooks (usePref)</h2>
      <p>hydrated: <span data-testid="hydrated">{hydrated}</span></p>
      <p>theme: <span data-testid="theme">{theme}</span></p>
      <p>sidebar: <span data-testid="sidebar">{String(sidebar)}</span></p>
      <p>density: <span data-testid="density">{density}</span></p>
      <p>pageSize: <span data-testid="pageSize">{pageSize}</span></p>

      <button data-testid="set-theme-dark" onClick={() => setTheme('dark')}>dark</button>
      <button data-testid="set-theme-light" onClick={() => setTheme('light')}>light</button>
      <button data-testid="reset-theme" onClick={() => prefs.theme.reset()}>reset theme</button>
      <button data-testid="toggle-sidebar" onClick={() => setSidebar((open) => !open)}>toggle sidebar</button>
      <button data-testid="reset-sidebar" onClick={() => prefs.sidebar.reset()}>reset sidebar</button>
      <button data-testid="set-density-compact" onClick={() => setDensity('compact')}>compact</button>
      <button data-testid="reset-density" onClick={() => prefs.density.reset()}>reset density</button>
      <button data-testid="inc-pageSize" onClick={() => setPageSize((n) => n + 5)}>page size +5</button>
      <button data-testid="reset-pageSize" onClick={() => prefs.pageSize.reset()}>reset page size</button>
    </section>
  );
}
