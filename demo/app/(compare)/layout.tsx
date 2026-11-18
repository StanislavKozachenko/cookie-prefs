import type { ReactNode } from 'react';
import { PrefsProvider } from 'cookie-prefs/next';
import { fontClasses } from '../../lib/fonts';
import { siteMetadata } from '../../lib/metadata';
import { prefs } from '../prefs';
import '../globals.css';

export const metadata = siteMetadata(
  'localStorage vs cookie-prefs · cookie-prefs demo',
  'Side by side: the same app with preferences in localStorage and in cookies. Reload both and watch which one jumps.',
);

export default function CompareLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={fontClasses}>
        {/* The default "script" mode: this page stays static and only needs the theme on <html>. */}
        <PrefsProvider prefs={prefs}>{children}</PrefsProvider>
      </body>
    </html>
  );
}
