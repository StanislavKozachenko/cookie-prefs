import type { ReactNode } from 'react';
import { ThemeProvider } from 'cookie-prefs/theme';
import { ThemeColor } from 'cookie-prefs/theme/color';

// `sepia` has no colour: the page's own theme-color tags (if any) apply to it.
export default function ThemeColorLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" themes={['light', 'dark', 'sepia']} defaultTheme="system" enableSystem>
          <ThemeColor colors={{ light: '#ffffff', dark: '#0a0a0a' }} />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
