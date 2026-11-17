'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'cookie-prefs/theme';

export function ThemePanel() {
  const { theme, resolvedTheme, systemTheme, setTheme } = useTheme();
  const [hydrated, setHydrated] = useState('no');
  useEffect(() => setHydrated('yes'), []);
  return (
    <section>
      <p>hydrated: <span data-testid="hydrated">{hydrated}</span></p>
      <p>theme: <span data-testid="theme">{theme ?? ''}</span></p>
      <p>resolvedTheme: <span data-testid="resolved">{resolvedTheme ?? ''}</span></p>
      <p>systemTheme: <span data-testid="system-theme">{systemTheme ?? ''}</span></p>
      <button data-testid="set-light" onClick={() => setTheme('light')}>light</button>
      <button data-testid="set-dark" onClick={() => setTheme('dark')}>dark</button>
      <button data-testid="set-system" onClick={() => setTheme('system')}>system</button>
      <button data-testid="toggle" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>toggle</button>
    </section>
  );
}
