import type { ReactNode } from 'react';
import { ThemeProvider } from 'cookie-prefs/theme';
import { ThemeColor } from 'cookie-prefs/theme/color';

export default function ForcedLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem forcedTheme="dark">
          <ThemeColor colors={{ light: '#ffffff', dark: '#0a0a0a' }} />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
