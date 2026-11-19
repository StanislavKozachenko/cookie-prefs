import type { Kind } from './builder';

/**
 * Reflection config of one pref, shared by the client and the inline script of
 * `cookie-prefs/script`: cookie name, targets, kind, and the DOM string of the default
 * (`null` removes).
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
 * Mirror a DOM string on `<html>` step by step like the inline script
 * (`src/script/index.ts`), including its one `try` per pref: an invalid class or
 * attribute name stops the targets after it. Never throws. Also used by the provider's
 * re-apply in `cookie-prefs/react`, through the internal `applyReflection` export.
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
