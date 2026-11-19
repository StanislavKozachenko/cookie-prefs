import { useMemo } from 'react';
import { usePref } from 'cookie-prefs/react';
import type { PrefsRecord, PrefTypes, PrefValues } from '../../core/types';

/**
 * Writes several prefs of a record at once: each key takes what that pref's `set()`
 * takes, a value or an updater of the previous value. Keys left out (or `undefined`)
 * are not touched.
 */
export type PrefsSetter<P extends PrefsRecord> = (patch: {
  [K in keyof P]?: P[K] extends { readonly '~types'?: PrefTypes<infer T, infer V> } ? T | ((prev: V) => T) : never;
}) => void;

/**
 * Read and write several prefs at once: `usePref` for every handle in `prefs` (the
 * record from `definePrefs()`, or any record of its handles), with the same server
 * snapshot, hydration, cross-tab sync and Safari refresh. `values` is typed like
 * `readPrefs()` and stays the same object until one of the prefs changes, so it is safe
 * in dependency arrays. The setter takes a partial patch and passes each entry to that
 * pref's `set()`, in order: a value or an updater of the previous value. An entry set
 * to `undefined` is skipped like a missing key; clear a pref with `reset()`. The setter
 * stays the same function while the record holds the same handles. Like any hook, it
 * needs the same keys on every render.
 * @example
 * const [{ theme, sidebar }, set] = usePrefs(prefs)
 * <button onClick={() => set({ sidebar: (open) => !open, theme: 'dark' })}>Focus</button>
 */
export function usePrefs<P extends PrefsRecord>(prefs: P): [values: PrefValues<P>, setValues: PrefsSetter<P>] {
  const entries = Object.entries(prefs);
  // One `usePref` per key, in the record's order: the hooks run in the same order on
  // every render as long as the keys stay the same.
  const values = entries.map(([key, handle]) => [key, usePref(handle)[0]]);
  return [
    // Keys and values as dependencies: a new object only when a value (or the record's
    // shape) changes. Built with `fromEntries`, so a key named `__proto__` stays a key.
    useMemo(() => Object.fromEntries(values), values.flat()) as PrefValues<P>,
    useMemo(
      () => (patch: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(patch)) if (value !== undefined) prefs[key]!.set(value);
      },
      entries.flat(),
    ),
  ];
}
