import type { Reflection } from '../core/reflect';
import type { PrefsRecord } from '../core/types';

/**
 * Key of a handle's reflection config, the same global symbol `src/core/store.ts`
 * defines. Read from the handle, not imported from the core, so this entry works with
 * handles from any copy of the core and bundles none of it.
 */
const REFLECTION = Symbol.for('cookie-prefs.reflection.1');

/**
 * Fixed ES5 source of the pre-paint script, applied to a JSON array of `Reflection`.
 * Mirrors `rawOf` + the parsers + `apply` (`src/core/reflect.ts`): decode, validate by
 * kind, fall back to the default, then write class / attribute / CSS variable on `<html>`.
 * The config comes as a string literal and is `JSON.parse`d: as an object literal, an
 * enum value named `__proto__` would set the prototype instead of adding a key.
 * `src/react/reapply.ts` ports it to DOM calls and finds the config after the only
 * `})("`: keep both in sync (parity test in `src/react/__tests__/reapply.test.ts`).
 */
const SOURCE =
  '(function(P){var r=document.documentElement,C="; "+document.cookie,k=0,j,p,t,n,i,e;' +
  'for(P=JSON.parse(P);p=P[k++];)try{t=p[2];n=C.split("; "+p[0]+"=")[1];' +
  'if(n!=null)try{n=decodeURIComponent(n.split(";")[0].replace(/^"(.*)"$/,"$1"));' +
  'if(t===1){t=parseFloat(n);n=t===+n&&isFinite(t)?""+t:null}' +
  'else if(t)n={}.hasOwnProperty.call(t,n)?t[n]:null}catch(e){n=null}' +
  'if(n==null)n=p[3];' +
  'for(j=0;i=p[1][j++];)if(i=="class"){for(e in t)r.classList.remove(t[e]);n!=null&&r.classList.add(n)}' +
  'else i[0]=="-"?n==null?r.style.removeProperty(i):r.style.setProperty(i,n):n==null?r.removeAttribute(i):r.setAttribute(i,n)}catch(e){}})(';

/**
 * Source of a blocking inline script that applies every `.reflect()` declaration to
 * `<html>` from `document.cookie` before first paint. Returns `''` when no pref
 * reflects. The output is fixed code plus escaped JSON config, safe to inline.
 * @example
 * <script nonce={nonce} dangerouslySetInnerHTML={{ __html: prefsScript(prefs) }} />
 */
export function prefsScript(prefs: PrefsRecord): string;
export function prefsScript(prefs: PrefsRecord): string {
  const config = Object.values(prefs)
    .map((handle) => (handle as { [REFLECTION]?: Reflection })[REFLECTION])
    .filter((r): r is Reflection => !!r);
  // JSON in a JSON string literal (valid ES5 once U+2028/U+2029 are escaped), with `<`,
  // `>` and `&` escaped so it is safe inside `<script>`.
  return config.length
    ? SOURCE +
        JSON.stringify(JSON.stringify(config)).replace(
          /[<>&\u2028\u2029]/g,
          (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
        ) +
        ')'
    : '';
}
