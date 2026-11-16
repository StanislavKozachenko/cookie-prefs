import type { ReactElement, ReactNode } from 'react';
import type { Pref, PrefSetter, PrefsSnapshot } from '../types';

export type { PrefSetter } from '../types';

const notImplemented = (): never => {
  throw new Error('prefkit/react: not implemented');
};

/**
 * Read and write one pref, like `useState`. Built on `useSyncExternalStore`, so every
 * component using the same pref stays in sync, also across tabs. During SSR and
 * hydration the value comes from the nearest `<PrefsProvider snapshot>`, or the
 * default when there is none.
 * @example
 * const [sidebar, setSidebar] = usePref(prefs.sidebar)
 * <button onClick={() => setSidebar((open) => !open)}>Toggle</button>
 */
export function usePref<T, V>(pref: Pref<T, V>): [value: V, setValue: PrefSetter<T, V>];
export function usePref(): never {
  return notImplemented();
}

export interface PrefsProviderProps {
  children?: ReactNode;
  /**
   * Raw pref cookies of the current request, from `snapshotPrefs()`. Hooks render
   * these values during SSR and hydration ("server" mode). Omit it on static pages
   * ("script" mode): hooks then render defaults until hydration ends.
   */
  snapshot?: PrefsSnapshot | undefined;
  /**
   * Inline script from `prefsScript()`. Rendered once as the provider's first child, so
   * place the provider at the top of `<body>`. It runs before paint on the initial
   * document and is inert on the client, so React does not warn about it.
   */
  script?: string | undefined;
  /** CSP nonce for the inline script. */
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
export function PrefsProvider(props: PrefsProviderProps): ReactElement;
export function PrefsProvider(): never {
  return notImplemented();
}
