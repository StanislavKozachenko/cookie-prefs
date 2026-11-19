import { applyReflection as apply } from 'cookie-prefs';
import type { Reflection } from '../core/reflect';

/**
 * Stored text of a cookie as `document.cookie` holds it (still URI-encoded), up to the
 * next `;`; `undefined` when absent. Shared by `reapply` and `usePref`'s refresh.
 */
export const rawCookie = (name: string) => ('; ' + document.cookie).split('; ' + name + '=')[1]?.split(';')[0];

/**
 * Apply the reflections of a `prefsScript()` string on `<html>` again, from the
 * current `document.cookie`, without running the script: its JSON config is read
 * back and applied with plain DOM calls, so CSP and Trusted Types have nothing to
 * check. A step-by-step port of the inline script; keep both in sync. The DOM writes
 * are the core's own (`applyReflection`, the step the store runs). Never throws.
 */
export const reapply = (script: string) => {
  try {
    // The script is fixed source ending in `})(`, then the JSON config inside a string
    // literal, then `)`. The fixed source holds `})("` only there and the literal escapes
    // every `"`, so the first match is the boundary.
    const config = JSON.parse(JSON.parse(script.slice(script.indexOf('})("') + 3, -1))) as Reflection[];
    for (let i = 0, p; (p = config[i++]); )
      try {
        const m = p[2] as Record<string, string> | 1 | 0 | null;
        let v: string | null | undefined = rawCookie(p[0]);
        if (v != null)
          try {
            v = decodeURIComponent(v.replace(/^"(.*)"$/, '$1'));
            if (m === 1) {
              const n = parseFloat(v);
              v = n === +v && isFinite(n) ? '' + n : null;
            } else if (m) v = ({}).hasOwnProperty.call(m, v) ? m[v] : null;
          } catch {
            v = null;
          }
        v ??= p[3];
        apply(p[1], p[2], v);
      } catch {
        // like the script: a bad pref stops only itself
      }
  } catch {
    // not a `prefsScript()` string: nothing to apply
  }
};
