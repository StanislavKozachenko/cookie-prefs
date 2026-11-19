import { useTheme } from 'cookie-prefs/theme';
import { useEffect, useLayoutEffect, useState, type ReactElement } from 'react';

/** Props of `ThemeColor`. */
export interface ThemeColorProps {
  /**
   * Theme name to the `<meta name="theme-color">` value (any CSS colour), keyed like
   * the provider's `themes` (custom themes and `value` keys too). Looked up for the theme
   * shown: `forcedTheme` first, `'system'` resolved to `'light'` or `'dark'`. A theme
   * without a colour leaves the page's own theme-color tags in charge.
   */
  colors: Readonly<Record<string, string>>;
  /** CSP nonce for the inline script, as passed to `ThemeProvider`. */
  nonce?: string | undefined;
}

/** Marks the tag this entry owns; React compares `property` before adopting a `<meta>`. */
const MARK = 'cookie-prefs';
const OURS = `meta[property="${MARK}"]`;
const FIRST = 'meta[name="theme-color"]';

/**
 * Fixed ES5 source of the pre-paint script. It finds the `ThemeProvider` script that ran
 * before it (its text starts with the theme script's parameter list), reads that
 * script's config back from its JSON string literal and resolves the theme with the
 * theme script's own statements, copied verbatim with the same parameter names: cookie,
 * then a next-themes value in `localStorage`, validation, default, `forcedTheme`,
 * `'system'` through `matchMedia`. Then it writes the colour into the tag it owns,
 * placed before every other theme-color tag. Keep the copy in sync with `SOURCE` in
 * `../script.ts`: a test checks the copy is part of the theme script, and a parity test
 * runs this script and the client over the theme script's table.
 */
const SOURCE =
  '(function(C){var n=document.scripts,i=n.length,t;' +
  "while(i--)if(!(t=n[i].text).indexOf('(function(k,l,a,m,d,f,s,c){')){" +
  '(function(k,l,a,m,d,f,s,c){var x,h,y;' +
  // from the theme script
  "if(!f){x=('; '+document.cookie).split('; '+k+'=')[1];" +
  "try{x=x!=null?decodeURIComponent(x.split(';')[0].replace(/^\"(.*)\"$/,'$1')):localStorage.getItem(l)}catch(e){x=null}" +
  "f=x!=null&&{}.hasOwnProperty.call(m,x)?x:d}" +
  "if(f=='system'&&s)f=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';" +
  // the colour
  'if(x={}.hasOwnProperty.call(C,f)&&C[f]){' +
  "h=document.querySelector('" + OURS + "')||document.createElement('meta');" +
  "h.name='theme-color';h.content=x;h.setAttribute('property','" + MARK + "');" +
  "y=document.querySelector('" + FIRST + "');" +
  'y?y!=h&&y.parentNode.insertBefore(h,y):document.head.appendChild(h)}' +
  "}).apply(0,JSON.parse(JSON.parse(t.slice(t.indexOf('JSON.parse(')+11,-2))));break}" +
  '})(JSON.parse(';

/**
 * The inline script for these colours: fixed code plus the map as JSON in a JSON string
 * literal, with `<`, `>`, `&`, U+2028 and U+2029 escaped (as for the theme script; a
 * key named `__proto__` stays an own key).
 */
const colorScript = (colors: Readonly<Record<string, string>>) =>
  SOURCE +
  JSON.stringify(JSON.stringify(colors)).replace(
    /[<>&\u2028\u2029]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  ) +
  '))';

/**
 * Write `color` into the owned tag, placed before every other theme-color tag so the
 * browser uses it; without a colour, remove the tag. Plain DOM calls, like the script.
 */
const set = (color?: string) => {
  let meta = document.querySelector<HTMLMetaElement>(OURS);
  if (!color) return meta?.remove();
  meta ||= document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = color;
  meta.setAttribute('property', MARK);
  const first = document.querySelector(FIRST);
  if (!first) document.head.append(meta);
  else if (first != meta) first.before(meta);
};

// React 18 warns about `useLayoutEffect` during SSR; the effect only matters in the browser.
const useLayout = typeof document == 'undefined' ? useEffect : useLayoutEffect;

/**
 * Keeps `<meta name="theme-color">` (the browser UI colour on mobile and of installed
 * apps) in sync with the theme shown by `ThemeProvider`: before hydration through an
 * inline script, afterwards through `useTheme()`, so it follows `setTheme`, the OS
 * scheme for `'system'`, `forcedTheme` and other tabs. Render it once, anywhere inside
 * `ThemeProvider`. It owns one tag and places it before the page's other theme-color
 * tags (Next.js `viewport.themeColor`, for example), which stay in place and apply to
 * themes without a colour.
 * @example
 * <ThemeProvider attribute="class">
 *   <ThemeColor colors={{ light: '#ffffff', dark: '#0a0a0a' }} />
 *   {children}
 * </ThemeProvider>
 */
export function ThemeColor({ colors, nonce }: ThemeColorProps): ReactElement {
  const { theme, resolvedTheme, forcedTheme, systemTheme } = useTheme();
  // The theme the provider paints: `forcedTheme` first, then `'system'` resolved.
  let name = forcedTheme || resolvedTheme!;
  if (name == 'system' && systemTheme) name = systemTheme;
  // `undefined` during SSR and hydration (and outside a provider): the script's tag stays.
  // Own keys only: theme names may be `__proto__` or `toString`.
  const color = theme == null ? undefined : ({}).hasOwnProperty.call(colors, name) ? colors[name] || '' : '';
  // Only the first script is rendered, as for `ThemeProvider`: new text on a hydrated
  // script is an `innerHTML` write that enforced Trusted Types reject, and the same
  // `__html` object keeps React 19.0 to 19.2 from writing it again on re-renders.
  const [first] = useState(() => ({ __html: colorScript(colors) }));

  useLayout(() => {
    if (color != null) {
      set(color);
      return set;
    }
  }, [color]);

  const server = typeof document == 'undefined';
  return (
    <script
      // A data block on the client, as for `ThemeProvider`: no React 19 warning, and a
      // client-rendered copy never runs. The server element keeps its nonce.
      type={server ? 'text/javascript' : 'text/plain'}
      nonce={server ? nonce : undefined}
      suppressHydrationWarning
      dangerouslySetInnerHTML={first}
    />
  );
}
