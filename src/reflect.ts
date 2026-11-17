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

/** DOM string of a parsed value; `null` when there is none. */
export const domOf = (kind: Kind | undefined, value: unknown): string | null =>
  value == null
    ? null
    : typeof kind == 'object'
      ? (kind[String(value)] ?? null)
      : String(value);

/** Mirror a DOM string on `<html>`, like the inline script does. Never throws. */
export const apply = (targets: readonly string[], kind: Kind | undefined, s: string | null) => {
  const h = document.documentElement;
  for (const t of targets) {
    try {
      if (t == 'class') {
        for (const c of Object.values(kind as object) as string[]) h.classList.remove(c);
        if (s != null) h.classList.add(s);
      } else if (t[0] == '-') {
        if (s == null) h.style.removeProperty(t);
        else h.style.setProperty(t, s);
      } else if (s == null) h.removeAttribute(t);
      else h.setAttribute(t, s);
    } catch {
      // invalid class or attribute name: leave the DOM as is
    }
  }
};

/**
 * Fixed ES5 source of the pre-paint script, applied to a JSON array of `Reflection`.
 * Mirrors `rawOf` + the parsers + `apply`: decode, validate by kind, fall back to
 * the default, then write class / attribute / CSS variable on `<html>`.
 * The config comes as a string literal and is `JSON.parse`d: as an object literal, an
 * enum value named `__proto__` would set the prototype instead of adding a key.
 * `src/react/reapply.ts` ports it to DOM calls and finds the config after the only
 * `})("`: keep both in sync (parity test in `src/react/reapply.test.ts`).
 */
const SOURCE =
  "(function(P){var d=document,h=d.documentElement,C='; '+d.cookie,i=0,j,p,m,v,n,t,k;" +
  'for(P=JSON.parse(P);p=P[i++];)try{m=p[2];v=C.split("; "+p[0]+"=")[1];' +
  'if(v!=null)try{v=decodeURIComponent(v.split(";")[0].replace(/^"(.*)"$/,"$1"));' +
  'if(m===1){n=parseFloat(v);v=n===+v&&isFinite(n)?""+n:null}' +
  'else if(m)v={}.hasOwnProperty.call(m,v)?m[v]:null}catch(e){v=null}' +
  'if(v==null)v=p[3];' +
  'for(j=0;t=p[1][j++];)if(t=="class"){for(k in m)h.classList.remove(m[k]);if(v!=null)h.classList.add(v)}' +
  'else if(t.charAt(0)=="-"){if(v==null)h.style.removeProperty(t);else h.style.setProperty(t,v)}' +
  'else if(v==null)h.removeAttribute(t);else h.setAttribute(t,v)}catch(e){}})(';

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
