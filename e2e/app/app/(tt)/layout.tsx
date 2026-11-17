import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { PrefsProvider } from 'cookie-prefs/next';
import { cspPrefs } from '../prefs-csp';
import { TtShell } from './tt/TtShell';

// Same strict CSP as /csp plus `require-trusted-types-for 'script'`.
export default async function Layout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <PrefsProvider prefs={cspPrefs} nonce={nonce}>
          <TtShell nonce={nonce}>{children}</TtShell>
        </PrefsProvider>
      </body>
    </html>
  );
}
