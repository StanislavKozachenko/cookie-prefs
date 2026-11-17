import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { PrefsProvider } from 'cookie-prefs/next';
import { ThemeProvider } from 'cookie-prefs/theme';
import { cspPrefs } from '../prefs-csp';

// Strict CSP from middleware (see middleware.ts / proxy.ts). csp: nonce is passed to the providers.
export default async function Layout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <PrefsProvider prefs={cspPrefs} nonce={nonce}>
          <ThemeProvider attribute="class" storageKey="ctheme" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
            {children}
          </ThemeProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
