import type { ReactNode } from 'react';
import { fontClasses } from '../../lib/fonts';
import { siteMetadata } from '../../lib/metadata';
import '../globals.css';

export const metadata = siteMetadata(
  'localStorage version · cookie-prefs demo',
  'The same app with preferences in localStorage: the server renders defaults and the page corrects itself after hydration.',
);

// The usual fix for the theme flash (what next-themes does): a blocking script that sets
// the theme class from localStorage before first paint. Nothing like it exists for the
// rest of the state, which React only learns after hydration.
const THEME_SCRIPT =
  "(function(){try{var t=localStorage.getItem('theme');document.documentElement.classList.add(t==='light'||t==='dark'?t:'system')}catch(e){}})()";

export default function LocalLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={fontClasses}>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
