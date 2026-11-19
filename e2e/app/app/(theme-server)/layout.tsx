import type { ReactNode } from 'react';
import { ThemeProvider } from 'cookie-prefs/theme';
import { getTheme } from 'cookie-prefs/theme/next';

// The stored theme read on the server: `<html>` carries it in the first HTML. `'system'`
// cannot be resolved on the server, so it gets no class and the inline script resolves it.
export default async function ThemeServerLayout({ children }: { children: ReactNode }) {
  const theme = await getTheme();
  return (
    <html lang="en" className={theme == 'system' ? undefined : theme} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
