import type { Kind } from './builder';

/**
 * Reflection config of one pref, shared by the client and the inline script:
 * cookie name, targets, kind, and the DOM string of the default (`null` removes).
 */
export type Reflection = [
  name: string,
  targets: readonly string[],
  kind: Kind | undefined,
  fallback: string | null,
];

/**
 * DOM string of a parsed value; `null` when there is none. For string and number
 * prefs it is the cookie's text as is: reflecting a free-form `pref.string()` lets
 * whoever can set the cookie (another subdomain, the user) choose that attribute or
 * CSS variable value, so reflect only values you would accept from them.
 */
export const domOf = (kind: Kind | undefined, value: unknown): string | null =>
  value == null
    ? null
    : typeof kind == 'object'
      ? (kind[value as string] ?? null)
      : String(value);

/**
 * Mirror a DOM string on `<html>` step by step like the inline script, including its
 * one `try` per pref: an invalid class or attribute name stops the targets after it.
 * Never throws.
 */
export const apply = (targets: readonly string[], kind: Kind | undefined, s: string | null) => {
  const h = document.documentElement;
  try {
    for (const t of targets)
      if (t == 'class') {
        for (const k in kind as object) h.classList.remove((kind as Record<string, string>)[k]!);
        if (s != null) h.classList.add(s);
      } else if (t[0] == '-') {
        if (s == null) h.style.removeProperty(t);
        else h.style.setProperty(t, s);
      } else if (s == null) h.removeAttribute(t);
      else h.setAttribute(t, s);
  } catch {
    // like the script: leave the rest of this pref as is
  }
};

/**
 * Fixed ES5 source of the pre-paint script, applied to a JSON array of `Reflection`.
 * Mirrors `rawOf` + the parsers + `apply`: decode, validate by kind, fall back to
 * the default, then write class / attribute / CSS variable on `<html>`.
 * The config comes as a string literal and is `JSON.parse`d: as an object literal, an
 * enum value named `__proto__` would set the prototype instead of adding a key.
 * `src/react/reapply.ts` ports it to DOM calls and finds the config after the only
 * `})("`: keep both in sync (parity test in `src/react/__tests__/reapply.test.ts`).
 * `r`, `t`, `n`, `i` and `e` (`<html>`, value map, DOM string, target, class key) are
 * the names minifiers give the same values in `apply`, so gzip finds the repeated DOM
 * code as one run: keep them, and check the minified `apply` when either changes.
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
 * The inline script for these reflections, or `''` when there are none. The config is
 * JSON in a JSON string literal (valid ES5 once U+2028/U+2029 are escaped), with `<`,
 * `>` and `&` escaped so it is safe inside `<script>`.
 */
export const script = (config: Reflection[]): string =>
  config.length
    ? SOURCE +
      JSON.stringify(JSON.stringify(config)).replace(
        /[<>&\u2028\u2029]/g,
        (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
      ) +
      ')'
    : '';
