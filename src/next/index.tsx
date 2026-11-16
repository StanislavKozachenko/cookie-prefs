import { cookies } from 'next/headers';
import { prefsScript, readPrefs, snapshotPrefs } from 'prefkit';
import { PrefsProvider as ClientPrefsProvider } from 'prefkit/react';
import type { ReactElement, ReactNode } from 'react';
import type { PrefsRecord, PrefValues } from '../types';

/**
 * Typed values of all prefs for the current request, via `await cookies()`.
 * Server-only (Server Components, Server Functions, Route Handlers). Reading cookies
 * makes the route dynamic; with Cache Components, call it inside `<Suspense>`.
 * Server Components are not refreshed by client writes: when output depends on a pref,
 * call `router.refresh()` after `set()`.
 * @example
 * const { sidebar } = await getPrefs(prefs)
 * return <Shell collapsed={!sidebar} />
 */
export async function getPrefs<P extends PrefsRecord>(prefs: P): Promise<PrefValues<P>> {
  return readPrefs(prefs, await cookies());
}

export interface NextPrefsProviderProps<P extends PrefsRecord> {
  /** The handles from `definePrefs()`. Stays on the server; only cookie strings reach the client. */
  prefs: P;
  /**
   * `'script'`: no `cookies()` read, the route stays static; the inline script reflects
   * prefs on `<html>` before paint and hooks render defaults until hydration, so
   * anything visible before hydration must come from reflected attributes plus CSS.
   * `'server'`: reads `cookies()` so hooks render exact values during SSR; makes the
   * route dynamic (with Cache Components, the layout needs `export const instant = false`).
   * @default 'script'
   */
  mode?: 'script' | 'server';
  /** CSP nonce for the inline script, e.g. from `(await headers()).get('x-nonce')`. */
  nonce?: string;
  children?: ReactNode;
}

/**
 * Server Component that wires prefs into the App Router: renders the pre-paint
 * script and the client `PrefsProvider` with the request snapshot. Put it at the top
 * of `<body>` in the root layout and add `suppressHydrationWarning` to `<html>`.
 * @example
 * <html lang="en" suppressHydrationWarning>
 *   <body>
 *     <PrefsProvider prefs={prefs}>{children}</PrefsProvider>
 *   </body>
 * </html>
 */
export async function PrefsProvider<P extends PrefsRecord>({
  prefs,
  mode = 'script',
  nonce,
  children,
}: NextPrefsProviderProps<P>): Promise<ReactElement> {
  // Script mode must not touch `cookies()`, or the whole route becomes dynamic.
  const snapshot = mode == 'server' ? snapshotPrefs(prefs, await cookies()) : undefined;
  return (
    <ClientPrefsProvider snapshot={snapshot} script={prefsScript(prefs)} nonce={nonce}>
      {children}
    </ClientPrefsProvider>
  );
}
