import type { ReactNode } from 'react';
import { PrefsProvider } from 'cookie-prefs/next';
import { fontClasses } from '../../lib/fonts';
import { siteMetadata } from '../../lib/metadata';
import { prefs } from '../prefs';
import '../globals.css';

export const metadata = siteMetadata(
  'cookie-prefs demo',
  'Typed cookie-backed preferences for Next.js: the server renders the right HTML on the first response, nothing flashes on reload.',
);

export default function CookieLayout({ children }: { children: ReactNode }) {
  return (
    // The inline script sets the theme class, data-sidebar and data-density on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <body className={fontClasses}>
        {/* "server": hooks render the request's cookie values during SSR, not the defaults. */}
        <PrefsProvider prefs={prefs} mode="server">
          {children}
        </PrefsProvider>
      </body>
    </html>
  );
}
