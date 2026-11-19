import type { Viewport } from 'next';
import { ColorPanel } from '../ColorPanel';

export const viewport: Viewport = { themeColor: '#ff0000' };

export default function Page() {
  return (
    <main>
      <h1 data-testid="page">other</h1>
      <ColorPanel />
    </main>
  );
}
