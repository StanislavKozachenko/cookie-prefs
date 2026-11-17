import type { Reflection } from '../core/reflect';

/**
 * Apply the reflections of a `prefsScript()` string on `<html>` again, from the
 * current `document.cookie`, without running the script: its JSON config is read
 * back and applied with plain DOM calls, so CSP and Trusted Types have nothing to
 * check. A step-by-step port of the inline script; keep both in sync. Never throws.
 */
export const reapply = (script: string) => {
  try {
    // The script is fixed source ending in `})(`, then the JSON config inside a string
    // literal, then `)`. The fixed source holds `})("` only there and the literal escapes
    // every `"`, so the first match is the boundary.
    const config = JSON.parse(JSON.parse(script.slice(script.indexOf('})("') + 3, -1))) as Reflection[];
    const h = document.documentElement;
    const cookies = '; ' + document.cookie;
    for (let i = 0, p; (p = config[i++]); )
      try {
        const m = p[2] as Record<string, string> | 1 | 0 | null;
        let v: string | null | undefined = cookies.split('; ' + p[0] + '=')[1];
        if (v != null)
          try {
            v = decodeURIComponent(v.split(';')[0]!.replace(/^"(.*)"$/, '$1'));
            if (m === 1) {
              const n = parseFloat(v);
              v = n === +v && isFinite(n) ? '' + n : null;
            } else if (m) v = Object.prototype.hasOwnProperty.call(m, v) ? m[v] : null;
          } catch {
            v = null;
          }
        v ??= p[3];
        for (let j = 0, t; (t = p[1][j++]); )
          if (t == 'class') {
            for (const k in m as object) h.classList.remove((m as Record<string, string>)[k]!);
            if (v != null) h.classList.add(v);
          } else if (t[0] == '-') {
            if (v == null) h.style.removeProperty(t);
            else h.style.setProperty(t, v);
          } else if (v == null) h.removeAttribute(t);
          else h.setAttribute(t, v);
      } catch {
        // like the script: a bad pref stops only itself
      }
  } catch {
    // not a `prefsScript()` string: nothing to apply
  }
};
