'use client';

import Link from 'next/link';
import { useTheme } from 'cookie-prefs/theme';
import { ThemePanel } from '../../(theme)/theme/ThemePanel';

export function ColorPanel() {
  const { setTheme } = useTheme();
  return (
    <>
      <ThemePanel />
      <button data-testid="set-sepia" onClick={() => setTheme('sepia')}>sepia</button>
      <nav>
        <Link href="/theme-color" data-testid="to-plain">no viewport colour</Link>{' '}
        <Link href="/theme-color/viewport" data-testid="to-viewport">viewport colours per scheme</Link>{' '}
        <Link href="/theme-color/other" data-testid="to-other">other viewport colour</Link>
      </nav>
    </>
  );
}
