import type { Page } from '@playwright/test';
import { test as base, DEFAULTS as ALL_DEFAULTS, NON_DEFAULT as ALL_NON_DEFAULT } from '../fixtures';

export { expect } from '../fixtures';

/**
 * The shared fixtures (the `watch` fixture fails a test on any console error or warning), plus one tolerated
 * warning: Firefox logs "The execution of microtasks on this page was reordered to avoid unsafe execution" for
 * React Router's own inline scripts that stream the loader data into a `ReadableStream`, with or without
 * cookie-prefs on the page.
 */
export const test = base.extend<{ firefoxStreamWarning: void }>({
  firefoxStreamWarning: [
    async ({ watch }, use) => {
      watch.ignore.push(/The execution of microtasks on this page was reordered to avoid unsafe execution/);
      await use();
    },
    { auto: true },
  ],
});

// The React Router app (e2e/react-router/app/prefs.ts) has four of the Next app's prefs, with the same cookie names.
export const IDS = ['theme', 'sidebar', 'density', 'pageSize'] as const;
type Id = (typeof IDS)[number];
const pick = (values: Record<Id, string>) => Object.fromEntries(IDS.map((id) => [id, values[id]])) as Record<Id, string>;
export const DEFAULTS = pick(ALL_DEFAULTS);
export const NON_DEFAULT = pick(ALL_NON_DEFAULT);

/** Serve every Vite chunk empty, so the page never hydrates: only the server HTML and the inline scripts run. */
export async function blockHydration(page: Page) {
  await page.route(/\/assets\/.*\.js(\?.*)?$/, (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
}
