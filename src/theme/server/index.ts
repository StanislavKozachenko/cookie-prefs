import { definePrefs, pref, type CookieSource } from 'cookie-prefs';

/**
 * The `ThemeProvider` props that decide which stored theme is valid. Pass the values
 * the provider gets, with the same defaults; any other provider prop may be passed and
 * is ignored, so one config object can feed both. When `themes` is a literal tuple,
 * `defaultTheme` and the keys of `value` must be among them (or `'system'`), so the
 * returned type is exactly the names that can come back.
 */
export interface ThemeOptions<T extends string = string> {
  /** All theme names. `'system'` is added when `enableSystem` is on. @default ['light', 'dark'] */
  themes?: readonly T[] | undefined;
  /** Whether `'system'` is a valid stored theme. @default true */
  enableSystem?: boolean | undefined;
  /** Cookie name that stores the choice. @default 'theme' */
  storageKey?: string | undefined;
  /**
   * Theme when nothing valid is stored. With `enableSystem` off and no `'light'` in
   * `themes`, pass it: the next-themes default `'light'` is returned as is.
   * @default enableSystem ? 'system' : 'light'
   */
  defaultTheme?: NoInfer<T> | 'system' | undefined;
  /** Theme name to DOM value; its keys are valid stored themes too, as in the provider. */
  value?: Readonly<Partial<Record<NoInfer<T> | 'system', string>>> | undefined;
}

/**
 * The stored theme for a request, read from its cookies: what `useTheme().theme` holds
 * after hydration for the same cookie and the same `ThemeProvider` options. A name the
 * provider does not list, or a malformed cookie, reads as `defaultTheme`. `'system'` is
 * returned as is: only the browser knows the OS scheme. `forcedTheme` is not applied.
 * Works on any server: a `Cookie` header string, a cookie store with `get(name)` or a
 * plain map, like the core's `readPrefs`. In the Next.js App Router use `getTheme()`
 * from `cookie-prefs/theme/next`.
 * @example
 * // React Router loader
 * const theme = readTheme(request.headers.get('cookie'), { themes: ['light', 'dark'] })
 */
export function readTheme<const T extends string = string>(
  source: CookieSource,
  options?: ThemeOptions<T>,
): T | 'system';
export function readTheme(
  source: CookieSource,
  // The provider's defaults and its pref, built as in `src/theme/index.tsx`, which does
  // not import this entry so the client bundle stays as it is: keep both in sync (parity
  // test in `src/theme/__tests__/server.test.tsx`). Valid names are `themes`, `'system'`
  // when `enableSystem` is on and the keys of `value`.
  {
    themes = ['light', 'dark'],
    enableSystem = true,
    storageKey = 'theme',
    defaultTheme = enableSystem ? 'system' : 'light',
    value,
  }: ThemeOptions = {},
): string {
  return definePrefs({
    theme: pref
      .enum(
        Object.keys(
          Object.fromEntries(
            (enableSystem ? [...themes, 'system'] : themes).concat(Object.keys(value || {})).map((t) => [t, t]),
          ),
        ) as [string],
      )
      .default(defaultTheme)
      // the `cookie` prop's attributes only matter for writes
      .options({ name: storageKey }),
  }).theme.read(source);
}
