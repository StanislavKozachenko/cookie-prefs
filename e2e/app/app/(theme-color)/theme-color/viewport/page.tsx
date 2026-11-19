import type { Viewport } from 'next';
import { ColorPanel } from '../ColorPanel';

// The same palette as ThemeColor, per OS scheme: the tags React renders for it must not
// take over the tag ThemeColor owns.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function Page() {
  return (
    <main>
      <h1 data-testid="page">viewport</h1>
      <ColorPanel />
    </main>
  );
}
