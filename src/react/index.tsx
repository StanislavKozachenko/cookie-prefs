import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Pref, PrefSetter, PrefsSnapshot } from '../core/types';
import { reapply } from './reapply';

export type { PrefSetter } from '../core/types';

const Snapshot = createContext<PrefsSnapshot | undefined>(undefined);

// React 18 warns about `useLayoutEffect` during SSR; the effect only matters in the browser.
const useLayout = typeof document == 'undefined' ? useEffect : useLayoutEffect;

/** Handles already checked for a refresh in this page load. */
const seen = new WeakSet<object>();

/**
 * Read and write one pref, like `useState`. Built on `useSyncExternalStore`, so every
 * component using the same pref stays in sync, also across tabs. During SSR and
 * hydration the value comes from the nearest `<PrefsProvider snapshot>`, or the
 * default when there is none.
 *
 * Safari caps cookies written by scripts at 7 days, whatever `maxAge` says. So once
 * per page load the hook re-writes the pref's cookie when it already exists, with the
 * same value: the 7 days then count from the last visit, not the last change. A pref
 * no hook uses is refreshed only by `set()`. A cookie set by the server (`Set-Cookie`,
 * e.g. middleware writing `pref.toCookie(value)`) is not capped.
 * @example
 * const [sidebar, setSidebar] = usePref(prefs.sidebar)
 * <button onClick={() => setSidebar((open) => !open)}>Toggle</button>
 */
export function usePref<T, V>(pref: Pref<T, V>): [value: V, setValue: PrefSetter<T, V>] {
  const snapshot = useContext(Snapshot);
  // `get` and `read` cache the parsed value per raw string, so json and custom prefs
  // return the same object until the cookie changes.
  const value = useSyncExternalStore(pref.subscribe, pref.get, () =>
    snapshot ? pref.read(snapshot) : pref.defaultValue,
  );
  useEffect(() => {
    if (seen.has(pref)) return;
    seen.add(pref);
    try {
      const current = pref.get() as unknown as T;
      // Only an existing cookie, and only when writing it back yields the very same
      // value (same object for json and custom prefs), so the store notifies nobody.
      if (
        current !== undefined &&
        ('; ' + document.cookie).indexOf('; ' + pref.name + '=') >= 0 &&
        pref.read({ [pref.name]: pref.toCookie(current).value }) === (current as unknown)
      )
        pref.set(() => current);
    } catch {
      // a codec that throws, or cookies that cannot be written: nothing to refresh
    }
  }, [pref]);
  return [value, pref.set];
}

export interface PrefsProviderProps {
  children?: ReactNode;
  /**
   * Raw pref cookies of the current request, from `snapshotPrefs()`. Hooks render
   * these values during SSR and hydration ("server" mode). Omit it on static pages
   * ("script" mode): hooks then render defaults until hydration ends. A nested
   * provider adds its snapshot to the outer one.
   */
  snapshot?: PrefsSnapshot | undefined;
  /**
   * Inline script from `prefsScript()`. Rendered once as the provider's first child, so
   * place the provider at the top of `<body>`. Only the first value is rendered; a
   * later one is still applied on `<html>`. It runs before paint on the initial
   * document and is inert on the client, so React does not warn about it. The
   * provider applies its reflections again with plain DOM calls, without running it,
   * on mount (React can reset `<html>` attributes on remount) and whenever the tab
   * becomes visible, so reflections also follow changes made in other tabs to prefs
   * that nothing in this tab subscribes to.
   */
  script?: string | undefined;
  /**
   * CSP nonce for the inline script. Rendered on the server only, since browsers hide
   * it after load. The client never runs a script, so it does not need the nonce.
   */
  nonce?: string | undefined;
}

/**
 * Carries the server snapshot to `usePref()` and renders the pre-paint script.
 * Optional in client-only apps. In Next.js App Router use `PrefsProvider` from
 * `prefkit/next` instead, which fills both props for you.
 * @example
 * <PrefsProvider
 *   snapshot={snapshotPrefs(prefs, request.headers.get('cookie'))}
 *   script={prefsScript(prefs)}
 * >
 *   <App />
 * </PrefsProvider>
 */
export function PrefsProvider({ children, snapshot, script, nonce }: PrefsProviderProps): ReactElement {
  const outer = useContext(Snapshot);
  const merged = useMemo(
    () => (outer && snapshot ? { ...outer, ...snapshot } : (snapshot ?? outer)),
    [outer, snapshot],
  );
  useLayout(() => {
    if (!script) return;
    // Nothing is executed: the config is read back from `script` and applied with DOM
    // calls, so neither CSP nor Trusted Types is involved.
    const onVisible = () => {
      if (document.visibilityState == 'visible') reapply(script);
    };
    reapply(script);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [script]);

  // Only the first script is rendered: it ran (or not) when the page was parsed, the
  // client copy is inert, and new text on a hydrated script is an `innerHTML` write
  // that enforced Trusted Types reject. The live `script` drives the effect above.
  const [first] = useState(script);
  // Evaluated per render: on the server there is no `document`.
  const server = typeof document == 'undefined';
  return (
    <Snapshot.Provider value={merged}>
      {first ? (
        <script
          // `text/plain` on the client makes the element a data block: React does not
          // warn about it, and a client-rendered copy never runs. The server copy runs
          // before paint. Both differences are expected during hydration.
          type={server ? 'text/javascript' : 'text/plain'}
          nonce={server ? nonce : undefined}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: first }}
        />
      ) : null}
      {children}
    </Snapshot.Provider>
  );
}
