import type { ReactNode } from 'react';
import { PrefsProvider } from 'cookie-prefs/next';
import { prefs } from '../prefs';

export default function ServerLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <PrefsProvider prefs={prefs} mode="server">{children}</PrefsProvider>
      </body>
    </html>
  );
}
