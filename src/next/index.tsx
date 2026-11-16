import type { ReactElement, ReactNode } from 'react';
import type { PrefsRecord, PrefValues } from '../types';

const notImplemented = (): never => {
  throw new Error('prefkit/next: not implemented');
};

/**
 * Typed values of all prefs for the current request, via `await cookies()`.
 * Server-only (Server Components, Server Functions, Route Handlers). Reading cookies
 * makes the route dynamic; with Cache Components, call it inside `<Suspense>`.
 * @example
 * const { sidebar } = await getPrefs(prefs)
 * return <Shell collapsed={!sidebar} />
 */
export function getPrefs<P extends PrefsRecord>(prefs: P): Promise<PrefValues<P>>;
export function getPrefs(): never {
  return notImplemented();
}

export interface NextPrefsProviderProps<P extends PrefsRecord> {
  /** The handles from `definePrefs()`. Stays on the server; only cookie strings reach the client. */
  prefs: P;
  /**
   * `'script'`: no `cookies()` read, the route stays static; the inline script reflects
   * prefs on `<html>` before paint and hooks render defaults until hydration.
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
export function PrefsProvider<P extends PrefsRecord>(
  props: NextPrefsProviderProps<P>,
): Promise<ReactElement>;
export function PrefsProvider(): never {
  return notImplemented();
}
