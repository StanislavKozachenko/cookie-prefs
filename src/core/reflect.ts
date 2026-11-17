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
 * `r`, `t` and `n` (`<html>`, value map, DOM string) are the names minifiers give the
 * same values in `apply`, so gzip finds the repeated DOM code: keep them.
 */
const SOURCE =
  '(function(P){var r=document.documentElement,C="; "+document.cookie,i=0,j,p,t,n,c,x,k;' +
  'for(P=JSON.parse(P);p=P[i++];)try{t=p[2];n=C.split("; "+p[0]+"=")[1];' +
  'if(n!=null)try{n=decodeURIComponent(n.split(";")[0].replace(/^"(.*)"$/,"$1"));' +
  'if(t===1){c=parseFloat(n);n=c===+n&&isFinite(c)?""+c:null}' +
  'else if(t)n={}.hasOwnProperty.call(t,n)?t[n]:null}catch(e){n=null}' +
  'if(n==null)n=p[3];' +
  'for(j=0;x=p[1][j++];)if(x=="class"){for(k in t)r.classList.remove(t[k]);n!=null&&r.classList.add(n)}' +
  'else x[0]=="-"?n==null?r.style.removeProperty(x):r.style.setProperty(x,n):n==null?r.removeAttribute(x):r.setAttribute(x,n)}catch(e){}})(';

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
