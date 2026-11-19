import { definePrefs, pref } from 'cookie-prefs';
import { getPrefs } from 'cookie-prefs/next';
import { readTheme, type ThemeOptions } from 'cookie-prefs/theme/server';

export type { ThemeOptions } from 'cookie-prefs/theme/server';

/**
 * The stored theme for the current request: what `useTheme().theme` holds after
 * hydration for the same cookie and the same `ThemeProvider` options (an unlisted or
 * malformed value reads as `defaultTheme`; `'system'` is returned as is, since only the
 * browser can resolve it; `forcedTheme` is not applied). Reads the request like
 * `getPrefs` from `cookie-prefs/next`, so a theme cookie set earlier in the same request
 * (a Server Function, middleware) is seen. Server-only (Server Components, Server
 * Functions, Route Handlers). Reading request cookies makes the route dynamic, so this
 * does not fit static rendering or Cache Components; the provider's inline script still
 * applies the theme before paint, and `<html>` keeps `suppressHydrationWarning`.
 * @example
 * const theme = await getTheme({ themes: ['light', 'dark'] })
 * <html lang="en" className={theme == 'system' ? undefined : theme} suppressHydrationWarning>
 */
export function getTheme<const T extends string = string>(options?: ThemeOptions<T>): Promise<T | 'system'>;
export async function getTheme(options: ThemeOptions = {}): Promise<string> {
  // The raw cookie as `getPrefs` reads the request, validated by `readTheme`.
  const raw = definePrefs({ theme: pref.string().options({ name: options.storageKey ?? 'theme' }) });
  return readTheme({ [raw.theme.name]: (await getPrefs(raw)).theme }, options);
}
