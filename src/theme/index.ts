import type {
  DetailedHTMLProps,
  Dispatch,
  ReactElement,
  ReactNode,
  ScriptHTMLAttributes,
  SetStateAction,
} from 'react';

const notImplemented = (): never => {
  throw new Error('prefkit/theme: not implemented');
};

/** `class` or any `data-*` attribute on `<html>`. */
export type Attribute = `data-${string}` | 'class';

/** Props for the inline script element, as in next-themes. */
export interface ScriptProps
  extends DetailedHTMLProps<ScriptHTMLAttributes<HTMLScriptElement>, HTMLScriptElement> {
  [dataAttribute: `data-${string}`]: unknown;
}

/** Same props and defaults as next-themes `ThemeProvider`. */
export interface ThemeProviderProps {
  children?: ReactNode;
  /** All theme names. `'system'` is added when `enableSystem` is on. @default ['light', 'dark'] */
  themes?: string[] | undefined;
  /** Theme used on this page regardless of the stored choice; the choice is kept. */
  forcedTheme?: string | undefined;
  /** Resolve `'system'` from `prefers-color-scheme`. @default true */
  enableSystem?: boolean | undefined;
  /** Disable CSS transitions while the theme switches. @default false */
  disableTransitionOnChange?: boolean | undefined;
  /** Set `color-scheme` on `<html>` for built-in UI (inputs, scrollbars). @default true */
  enableColorScheme?: boolean | undefined;
  /**
   * Cookie name that stores the choice. A value left in `localStorage` under the same
   * key by next-themes is moved to the cookie once. @default 'theme'
   */
  storageKey?: string | undefined;
  /** Theme when nothing is stored. @default enableSystem ? 'system' : 'light' */
  defaultTheme?: string | undefined;
  /** Where the theme is written on `<html>`; accepts a list. @default 'data-theme' */
  attribute?: Attribute | Attribute[] | undefined;
  /** Theme name to the value written to the DOM. */
  value?: Record<string, string> | undefined;
  /** CSP nonce for the inline script and the transition-disabling style. */
  nonce?: string | undefined;
  /** Extra props for the inline script element. */
  scriptProps?: ScriptProps | undefined;
}

/**
 * Return type of `useTheme()`, same fields as next-themes. `T` narrows theme names;
 * the default `string` matches next-themes exactly.
 */
export interface UseThemeProps<T extends string = string> {
  /** All theme names, including `'system'` when `enableSystem` is on. */
  themes: (T | 'system')[];
  /** Forced theme of the current page, if any. */
  forcedTheme?: T | undefined;
  /** Store a theme; accepts a value or an updater. */
  setTheme: Dispatch<SetStateAction<T | 'system'>>;
  /** Stored theme, possibly `'system'`. `undefined` during SSR and hydration. */
  theme?: T | 'system' | undefined;
  /** Theme actually shown (`'system'` resolved). `undefined` during SSR and hydration. */
  resolvedTheme?: T | undefined;
  /** OS preference when `enableSystem` is on. `undefined` during SSR and hydration. */
  systemTheme?: 'light' | 'dark' | undefined;
}

/**
 * Drop-in replacement for next-themes `ThemeProvider`, stored in a cookie so the
 * server can read it. Migration is an import swap. Its inline script never triggers
 * the React 19 script warning and needs no `cookies()` read, so pages stay static.
 * Add `suppressHydrationWarning` to `<html>`.
 * @example
 * <html lang="en" suppressHydrationWarning>
 *   <body>
 *     <ThemeProvider attribute="class" defaultTheme="system">{children}</ThemeProvider>
 *   </body>
 * </html>
 */
export function ThemeProvider(props: ThemeProviderProps): ReactElement;
export function ThemeProvider(): never {
  return notImplemented();
}

/**
 * Current theme and setter, same shape as next-themes `useTheme()`. Works without a
 * provider (returns `themes: []` and a no-op setter), like next-themes.
 * @example
 * const { resolvedTheme, setTheme } = useTheme()
 * <button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>Toggle</button>
 */
export function useTheme<T extends string = string>(): UseThemeProps<T>;
export function useTheme(): never {
  return notImplemented();
}
