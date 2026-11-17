'use client';

import { useEffect, useState } from 'react';
import { usePref } from 'cookie-prefs/react';
import { useTheme } from 'cookie-prefs/theme';
import { cspPrefs } from '../prefs-csp';

export function CspPanel() {
  const [sidebar, setSidebar] = usePref(cspPrefs.sidebar);
  const [density, setDensity] = usePref(cspPrefs.density);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [hydrated, setHydrated] = useState('no');
  useEffect(() => setHydrated('yes'), []);
  return (
    <section>
      <p>hydrated: <span data-testid="hydrated">{hydrated}</span></p>
      <p>sidebar: <span data-testid="sidebar">{String(sidebar)}</span></p>
      <p>density: <span data-testid="density">{density}</span></p>
      <p>theme: <span data-testid="theme">{theme ?? ''}</span></p>
      <p>resolved: <span data-testid="resolved">{resolvedTheme ?? ''}</span></p>
      <button data-testid="toggle-sidebar" onClick={() => setSidebar((v) => !v)}>toggle sidebar</button>
      <button data-testid="set-density-compact" onClick={() => setDensity('compact')}>compact</button>
      <button data-testid="set-density-cozy" onClick={() => setDensity('cozy')}>cozy</button>
      <button data-testid="set-dark" onClick={() => setTheme('dark')}>dark</button>
      <button data-testid="set-light" onClick={() => setTheme('light')}>light</button>
    </section>
  );
}
