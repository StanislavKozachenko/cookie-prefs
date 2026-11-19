'use client';

import { usePrefs } from 'cookie-prefs/react';
import { prefs } from '../prefs';
import { fmt } from '../lib/fmt';

/** `usePrefs` over a sub-record of the handles (a new object on every render). */
export function BatchPanel() {
  const [values, set] = usePrefs({ theme: prefs.theme, sidebar: prefs.sidebar, columns: prefs.columns });
  return (
    <section>
      <h2>usePrefs</h2>
      <p>theme: <span data-testid="batch-theme">{fmt(values.theme)}</span></p>
      <p>sidebar: <span data-testid="batch-sidebar">{fmt(values.sidebar)}</span></p>
      <p>columns: <span data-testid="batch-columns">{fmt(values.columns)}</span></p>
      <button
        data-testid="batch-patch"
        onClick={() => set({ theme: 'light', sidebar: (open) => !open, columns: (prev) => [...prev, 'c'] })}
      >
        patch
      </button>
    </section>
  );
}
