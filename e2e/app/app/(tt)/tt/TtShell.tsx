'use client';

import { useState, type ReactNode } from 'react';
import { ThemeProvider } from 'cookie-prefs/theme';
import { ThemeColor } from 'cookie-prefs/theme/color';

/** Holds ThemeProvider props in state so a test can change them after hydration. */
export function TtShell({ nonce, children }: { nonce: string | undefined; children: ReactNode }) {
  const [attribute, setAttribute] = useState<'class' | 'data-theme'>('class');
  const [disable, setDisable] = useState(true);
  const [defaultTheme, setDefaultTheme] = useState('system');
  return (
    <ThemeProvider
      attribute={attribute}
      storageKey="ctheme"
      defaultTheme={defaultTheme}
      enableSystem
      disableTransitionOnChange={disable}
      nonce={nonce}
    >
      <ThemeColor colors={{ light: '#ffffff', dark: '#0a0a0a' }} nonce={nonce} />
      <div>
        <button data-testid="prop-attribute" onClick={() => setAttribute((a) => (a === 'class' ? 'data-theme' : 'class'))}>attribute</button>
        <button data-testid="prop-disable" onClick={() => setDisable((d) => !d)}>disableTransitionOnChange</button>
        <button data-testid="prop-default" onClick={() => setDefaultTheme((d) => (d === 'system' ? 'dark' : 'system'))}>defaultTheme</button>
        <span data-testid="prop-state">{attribute}|{String(disable)}|{defaultTheme}</span>
      </div>
      {children}
    </ThemeProvider>
  );
}
