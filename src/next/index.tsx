import { cookies, headers } from 'next/headers.js';
import { prefsScript, readPrefs, snapshotPrefs } from 'cookie-prefs';
import { PrefsProvider as ClientPrefsProvider } from 'cookie-prefs/react';
import type { ReactElement, ReactNode } from 'react';
import type { PrefsRecord, PrefsSnapshot, PrefValues } from '../core/types';

/**
 * Raw values of these prefs for this request. The `Cookie` header is parsed like
 * `document.cookie` and the inline script do (first duplicate wins, quotes stripped;
 * `cookies()` lets the last win and keeps quotes). Only `cookies()` sees writes made
 * earlier in this request (Server Function, middleware), so a `cookies()` value that
 * equals none of the header's values for its name, compared as Next parses them, was
 * written now and wins. `cookies().delete()` leaves `''` there, read as no cookie.
 */
const requestSnapshot = async (prefs: PrefsRecord): Promise<PrefsSnapshot> => {
  const header = (await headers()).get('cookie') ?? '';
  const store = await cookies();
  let snapshot = snapshotPrefs(prefs, header) as Record<string, string>;
  for (const { name } of Object.values(prefs)) {
    const value = store.get(name)?.value;
    const key = name + '=';
    if (
      value != null &&
      !header.split(/; */).some((part) => {
        // Next's parse of this part: URI-decoded, quotes kept, a bare name is 'true'
        part = part == name ? key + 'true' : part;
        try {
          return part.startsWith(key) && decodeURIComponent(part.slice(key.length)) == value;
        } catch {
          // malformed: Next skips it too
        }
      })
    ) {
      // a spread, not an assignment: a cookie named `__proto__` is an own key too
      if (value) snapshot = { ...snapshot, [name]: value };
      else delete snapshot[name];
    }
  }
  return snapshot;
};

/**
 * Typed values of all prefs for the current request, read from the `Cookie` header
 * like the browser does, plus cookies set or deleted earlier in the same request
 * (`(await cookies()).set(prefs.x.toCookie(v))` in a Server Function, middleware).
 * Server-only (Server Components, Server Functions, Route Handlers). Reading request
 * cookies makes the route dynamic; with Cache Components, call it inside
 * `<Suspense>`. Server Components are not refreshed by client writes: when output
 * depends on a pref, call `router.refresh()` after `set()`.
 * @example
 * const { sidebar } = await getPrefs(prefs)
 * return <Shell collapsed={!sidebar} />
 */
export async function getPrefs<P extends PrefsRecord>(prefs: P): Promise<PrefValues<P>> {
  return readPrefs(prefs, await requestSnapshot(prefs));
}

export interface NextPrefsProviderProps<P extends PrefsRecord> {
  /** The handles from `definePrefs()`. Stays on the server; only cookie strings reach the client. */
  prefs: P;
  /**
   * `'script'`: no request API is touched, the route stays static; the inline script
   * reflects prefs on `<html>` before paint and hooks render defaults until hydration,
   * so anything visible before hydration must come from reflected attributes plus CSS.
   * `'server'`: reads request cookies (like `getPrefs`) so hooks render exact
   * values during SSR; makes the route dynamic (with Cache Components, the layout
   * needs `export const instant = false`).
   * @default 'script'
   */
  mode?: 'script' | 'server' | undefined;
  /** CSP nonce for the inline script, e.g. from `(await headers()).get('x-nonce') ?? undefined`. */
  nonce?: string | undefined;
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
  mode,
  ...props
}: NextPrefsProviderProps<P>): Promise<ReactElement> {
  return (
    <ClientPrefsProvider
      // `nonce` and `children`; `prefs` stays on the server
      {...props}
      // Script mode (the default) must not touch request APIs, or the whole route becomes dynamic.
      snapshot={mode == 'server' ? await requestSnapshot(prefs) : undefined}
      script={prefsScript(prefs)}
    />
  );
}
