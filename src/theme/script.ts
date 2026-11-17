/**
 * Config of the theme script, shared by the inline script and the client. `dom` maps
 * every valid stored name (`themes` prop, `value` keys, `'system'` when
 * `enableSystem` is on) to the string written to the DOM.
 */
export type Config = [
  cookie: string,
  storageKey: string,
  attributes: readonly string[],
  dom: Readonly<Record<string, string>>,
  fallback: string,
  forced: string | null,
  enableSystem: 0 | 1,
  /** `color-scheme` used for themes other than light and dark; `null` when disabled. */
  colorScheme: string | null,
];

export const MEDIA = '(prefers-color-scheme: dark)';

/**
 * Fixed ES5 source of the pre-paint script, called with the `Config` items as
 * arguments. Reads the cookie (or, when it is absent, a next-themes value in
 * `localStorage`), validates it, falls back to the default, resolves `'system'`,
 * then writes the class / attributes and `color-scheme` on `<html>`. Never built from
 * `Function.prototype.toString`, so minifiers and `keepNames` cannot break it
 * (next-themes #370). `paint` below is the client port: keep both in sync (parity
 * test in `src/theme/__tests__/script.test.tsx`).
 */
const SOURCE =
  '(function(k,l,a,m,d,f,s,c){var h=document.documentElement,o={}.hasOwnProperty,x,i,j;' +
  "if(!f){x=('; '+document.cookie).split('; '+k+'=')[1];" +
  "try{x=x!=null?decodeURIComponent(x.split(';')[0].replace(/^\"(.*)\"$/,'$1')):localStorage.getItem(l)}catch(e){x=null}" +
  'f=x!=null&&o.call(m,x)?x:d}' +
  "if(f=='system'&&s)f=matchMedia('" +
  MEDIA +
  "').matches?'dark':'light';" +
  'x=o.call(m,f)?m[f]:f;' +
  "for(i=0;i<a.length;i++)try{if(a[i]=='class'){for(j in m)h.classList.remove(m[j]);h.classList.add(x)}" +
  'else h.setAttribute(a[i],x)}catch(e){}' +
  'if(c!=null)h.style.colorScheme=/^(light|dark)$/.test(f)?f:c})';

/**
 * The inline script for a config: fixed code plus the config as JSON, with `<`, `>`,
 * `&`, U+2028 and U+2029 escaped so it is safe inside `<script>` (local copy of the
 * core helper, which is internal).
 */
export const themeScript = (config: Config): string =>
  SOURCE +
  '.apply(0,' +
  JSON.stringify(config).replace(
    /[<>&\u2028\u2029]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  ) +
  ')';

/** Own key check; theme names are user input and may be `__proto__` or `toString`. */
export const has = (map: object, key: string) => Object.prototype.hasOwnProperty.call(map, key);

/** The `prefers-color-scheme` query; `undefined` where `matchMedia` is missing (jsdom). */
export const media = () => globalThis.matchMedia?.(MEDIA);

/** OS colour scheme; `'light'` where `matchMedia` is missing. */
export const system = (): 'light' | 'dark' => (media()?.matches ? 'dark' : 'light');

export const LIGHT_DARK = /^(light|dark)$/;

/**
 * Apply a stored theme (already validated, default applied) to `<html>` like the
 * inline script does, with plain DOM calls: nothing is executed, so CSP and Trusted
 * Types have nothing to check. A step-by-step port of `SOURCE`. Never throws.
 */
export const paint = ([, , attributes, dom, , forced, enableSystem, colorScheme]: Config, theme: string) => {
  const h = document.documentElement;
  let t = forced || theme;
  if (t == 'system' && enableSystem) t = system();
  const name = has(dom, t) ? dom[t]! : t;
  for (const attribute of attributes)
    try {
      if (attribute == 'class') {
        for (const k in dom) h.classList.remove(dom[k]!);
        h.classList.add(name);
      } else h.setAttribute(attribute, name);
    } catch {
      // invalid class or attribute name: leave this target as is, like the script
    }
  if (colorScheme != null) h.style.colorScheme = LIGHT_DARK.test(t) ? t : colorScheme;
};

/**
 * Disable CSS transitions until the next tick, like next-themes. The style element
 * carries the nonce, so a strict `style-src 'nonce-…'` policy allows it. Returns the
 * function that re-enables them once the theme is applied.
 */
export const pauseTransitions = (nonce: string | undefined) => {
  const css = document.createElement('style');
  if (nonce) css.setAttribute('nonce', nonce);
  css.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(css);
  return () => {
    // Read a computed value to force a restyle with transitions off, then re-enable.
    restyle();
    setTimeout(() => css.remove(), 1);
  };
};

const restyle = () => getComputedStyle(document.documentElement).opacity;
