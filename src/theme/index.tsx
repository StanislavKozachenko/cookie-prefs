import { definePrefs, pref, type CookieOptions } from 'prefkit';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
  type DetailedHTMLProps,
  type Dispatch,
  type ReactElement,
  type ReactNode,
  type ScriptHTMLAttributes,
  type SetStateAction,
} from 'react';
import { has, LIGHT_DARK, media, paint, pauseTransitions, system, themeScript, type Config } from './script';

/** `class` or any `data-*` attribute on `<html>`. */
export type Attribute = `data-${string}` | 'class';

/** Props for the inline script element, as in next-themes. */
export interface ScriptProps
  extends DetailedHTMLProps<ScriptHTMLAttributes<HTMLScriptElement>, HTMLScriptElement> {
  [dataAttribute: `data-${string}`]: unknown;
}

/** Same props and defaults as next-themes `ThemeProvider`, plus `cookie`. */
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
   * key by next-themes is moved to the cookie once and removed from `localStorage`, so
   * rolling back to next-themes starts from its default. @default 'theme'
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
  /**
   * Attributes of the theme cookie, as for any pref (not in next-themes). Defaults:
   * `Path=/`, `SameSite=Lax`, 400 days, current host only, `Secure` on `https:`.
   * @example
   * // one theme for app.example.com and www.example.com
   * <ThemeProvider cookie={{ domain: 'example.com' }}>
   * // inside a cross-site iframe
   * <ThemeProvider cookie={{ sameSite: 'none', secure: true, partitioned: true }}>
   */
  cookie?: CookieOptions | undefined;
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

const Context = createContext<UseThemeProps | undefined>(undefined);

/** What `useTheme()` returns outside a provider, as in next-themes. */
const outside: UseThemeProps = { setTheme: () => {}, themes: [] };

const DEFAULT_THEMES = ['light', 'dark'];

// React 18 warns about `useLayoutEffect` during SSR; the effects only matter in the browser.
const useLayout = typeof document == 'undefined' ? useEffect : useLayoutEffect;

// Safari and iOS before 14 only have the older `addListener` / `removeListener`.
const subscribeSystem = (onChange: () => void) => {
  const query = media();
  if (query?.addEventListener) query.addEventListener('change', onChange);
  else query?.addListener(onChange);
  return () => {
    if (query?.removeEventListener) query.removeEventListener('change', onChange);
    else query?.removeListener(onChange);
  };
};

const none = () => undefined;

/** Whether `document.cookie` holds a cookie of this (encoded) name, valid or not. */
const exists = (name: string) => ('; ' + document.cookie).indexOf('; ' + name + '=') >= 0;

/** Theme cookie names already checked for a refresh in this page load. */
const seen = new Set<string>();

/**
 * Drop-in replacement for next-themes `ThemeProvider`, stored in a cookie so the
 * server can read it. Migration is an import swap. Its inline script never triggers
 * the React 19 script warning and needs no `cookies()` read, so pages stay static.
 * Add `suppressHydrationWarning` to `<html>`.
 *
 * Safari caps cookies written by scripts at 7 days, so once per page load the
 * provider re-writes an existing theme cookie: the choice lasts 7 days after the
 * last visit there, not after the last change. A cookie set by the server
 * (`Set-Cookie`, e.g. middleware) is not capped.
 * @example
 * <html lang="en" suppressHydrationWarning>
 *   <body>
 *     <ThemeProvider attribute="class" defaultTheme="system">{children}</ThemeProvider>
 *   </body>
 * </html>
 */
export function ThemeProvider(props: ThemeProviderProps): ReactElement;
export function ThemeProvider(props: ThemeProviderProps): ReactElement {
  // Like next-themes, a nested provider only passes its children through.
  return useContext(Context) ? <>{props.children}</> : <Theme {...props} />;
}

function Theme({
  children,
  themes = DEFAULT_THEMES,
  forcedTheme,
  enableSystem = true,
  disableTransitionOnChange = false,
  enableColorScheme = true,
  storageKey = 'theme',
  defaultTheme = enableSystem ? 'system' : 'light',
  attribute = 'data-theme',
  value,
  nonce,
  scriptProps,
  cookie,
}: ThemeProviderProps): ReactElement {
  const listed = enableSystem ? [...themes, 'system'] : themes;
  // Every valid stored name to its DOM string. `value` keys are themes too, as in the
  // next-themes README example.
  const dom = Object.fromEntries(listed.map((t) => [t, t]).concat(Object.entries(value || {})));
  const fresh: Config = [
    encodeURIComponent(storageKey), // the core's cookie name for `name: storageKey`
    storageKey,
    ([] as string[]).concat(attribute),
    dom,
    defaultTheme,
    forcedTheme || null,
    enableSystem ? 1 : 0,
    // `color-scheme` for other themes: the default when it is light or dark, as in next-themes
    enableColorScheme ? (LIGHT_DARK.test(defaultTheme) ? defaultTheme : '') : null,
  ];
  const script = themeScript(fresh);
  // Only the first script is rendered: it ran (or not) when the page was parsed, the
  // client copy is inert, and new text on a hydrated script is an `innerHTML` write
  // that enforced Trusted Types reject. The live config below drives the client.
  const [first] = useState(script);
  // Inline `themes`, `value` and `cookie` literals are new objects on every render, so
  // the store, the config and the setter are keyed on the script, which encodes all of
  // them but `cookie`, and on `cookie` as JSON.
  const [handle, config, themeList, setTheme] = useMemo(() => {
    const handle = definePrefs({
      theme: pref
        .enum(Object.keys(dom) as [string])
        .default(defaultTheme)
        .options({ ...cookie, name: storageKey }),
    }).theme;
    const setTheme: UseThemeProps['setTheme'] = (next) => {
      const name = typeof next == 'function' ? next(handle.get()) : next;
      // A name outside the list would read back as the default: keep the stored one.
      if (has(dom, name)) handle.set(name);
    };
    return [handle, fresh, listed, setTheme] as const;
  }, [script, JSON.stringify(cookie)]);

  // External stores, so a provider kept hidden by <Activity> never holds a stale theme
  // (next-themes #375). `undefined` during SSR and hydration, as in next-themes.
  const theme = useSyncExternalStore(handle.subscribe, handle.get, none);
  const systemTheme = useSyncExternalStore(subscribeSystem, system, none);
  const resolvedTheme = theme == 'system' && enableSystem ? systemTheme : theme;
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  // Runs on mount, so it also restores `<html>` after React reset it on a remount
  // (Strict Mode), and on every change. It reads the current cookie, never rendered
  // state, so re-running on an <Activity> reveal cannot bring an old theme back.
  useLayout(() => {
    const once = !seen.has(handle.name);
    seen.add(handle.name);
    try {
      // One-time move from next-themes: no cookie yet, a valid name in localStorage. The
      // value is removed once the cookie holds it (or when it is invalid), so a later
      // missing cookie never brings it back.
      if (!exists(handle.name)) {
        const stored = localStorage.getItem(config[1]);
        if (stored != null) {
          const valid = has(config[3], stored);
          if (valid) handle.set(stored);
          // Kept when the write did not stick (cookies blocked): nothing is lost.
          if (!valid || exists(handle.name)) localStorage.removeItem(config[1]);
        }
      }
      // Safari caps script-written cookies at 7 days: re-write an existing cookie once
      // per page load, so the window slides with visits. Same value: no notification.
      else if (once) handle.set(handle.get());
    } catch {
      // storage or cookies unavailable: keep the default
    }
    const resume = disableTransitionOnChange && pauseTransitions(nonce);
    paint(config, handle.get());
    if (resume) resume();
    // Something without a notification (a server `Set-Cookie`, another library) may have
    // changed the cookie while the tab was hidden: repaint, and re-render so the hook
    // reads the cookie again.
    const onVisible = () => {
      if (document.visibilityState == 'visible') {
        paint(config, handle.get());
        refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [config, handle, theme, systemTheme, disableTransitionOnChange, nonce]);

  const context = useMemo<UseThemeProps>(
    () => ({
      theme,
      setTheme,
      forcedTheme,
      resolvedTheme,
      themes: themeList,
      systemTheme: enableSystem ? systemTheme : undefined,
    }),
    [theme, setTheme, forcedTheme, resolvedTheme, themeList, enableSystem, systemTheme],
  );

  // Evaluated per render: on the server there is no `document`.
  const server = typeof document == 'undefined';
  return (
    <Context.Provider value={context}>
      <script
        {...scriptProps}
        // `text/plain` on the client makes the element a data block: React 19 does not
        // warn about it (next-themes #385, #387), and a client-rendered copy never
        // runs. The server copy runs before paint. Both differences are expected
        // during hydration; the server element keeps its nonce.
        type={server ? 'text/javascript' : 'text/plain'}
        nonce={server ? nonce : undefined}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: first }}
      />
      {children}
    </Context.Provider>
  );
}

/**
 * Current theme and setter, same shape as next-themes `useTheme()`. Works without a
 * provider (returns `themes: []` and a no-op setter), like next-themes.
 * @example
 * const { resolvedTheme, setTheme } = useTheme()
 * <button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>Toggle</button>
 */
export function useTheme<T extends string = string>(): UseThemeProps<T>;
export function useTheme(): UseThemeProps {
  return useContext(Context) ?? outside;
}
