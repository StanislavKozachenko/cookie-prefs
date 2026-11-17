import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { PrefsProvider } from 'cookie-prefs/next';
import { ThemeProvider } from 'cookie-prefs/theme';
import { cspPrefs } from '../prefs-csp';

// Strict CSP from middleware (see middleware.ts / proxy.ts). cspbad: nonce is NOT passed to the providers.
export default async function Layout({ children }: { children: ReactNode }) {
  await headers();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <PrefsProvider prefs={cspPrefs}>
          <ThemeProvider attribute="class" storageKey="ctheme" defaultTheme="system" enableSystem disableTransitionOnChange>
            {children}
          </ThemeProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
