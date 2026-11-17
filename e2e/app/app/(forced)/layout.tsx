import type { ReactNode } from 'react';
import { ThemeProvider } from 'cookie-prefs/theme';

export default function ForcedLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem forcedTheme="dark">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
