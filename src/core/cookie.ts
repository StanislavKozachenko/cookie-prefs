import type { CookieGetter, CookieInit, CookieOptions, CookieSource } from './types';

/**
 * Raw value of cookie `name` from a source, URI-decoded. A header string is decoded
 * here; cookie stores and plain maps already hold decoded values (Next.js, Express
 * and `snapshotPrefs()` all decode). The first of duplicate cookies wins, like in
 * browsers. May throw on a malformed value; callers fall back to the default.
 */
export const rawOf = (source: CookieSource, name: string): string | undefined => {
  if (typeof source == 'string') {
    for (const part of source.split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() == name)
        return decodeURIComponent(
          part
            .slice(i + 1)
            .trim()
            .replace(/^"(.*)"$/, '$1'),
        );
    }
    return;
  }
  // null and undefined read as no cookies
  return typeof source?.get == 'function'
    ? (source as CookieGetter).get(name)?.value
    : (source as Record<string, string | undefined> | null | undefined)?.[name];
};

/**
 * Own enumerable properties of `sources`, later ones winning, like a spread, except that
 * an `undefined` (or `null`) value means "not set" and keeps the value from the sources
 * before.
 */
export const merge = <T extends object>(...sources: (T | undefined)[]): T =>
  Object.fromEntries(sources.flatMap((s) => Object.entries({ ...s }).filter((e) => e[1] != null))) as T;

/** Default cookie attributes. */
export const defaults = { path: '/', maxAge: 34560000, sameSite: 'lax' } as const;

/**
 * `Set-Cookie`-style string for `document.cookie`. `value` undefined deletes the
 * cookie. `Secure` defaults to on for `https:` pages. Lone surrogates, which
 * `encodeURIComponent` rejects, become U+FFFD where `String.prototype.toWellFormed`
 * exists; elsewhere this throws and the caller writes nothing.
 */
export const serialize = (c: Omit<CookieInit, 'value'> & CookieOptions, value?: string): string =>
  c.name +
  '=' +
  (value == null
    ? ''
    : encodeURIComponent((value as unknown as { toWellFormed?(): string }).toWellFormed?.() ?? value)) +
  '; Path=' +
  c.path +
  (c.domain ? '; Domain=' + c.domain : '') +
  '; Max-Age=' +
  (value == null ? 0 : c.maxAge) +
  '; SameSite=' +
  c.sameSite +
  ((c.secure ?? location.protocol == 'https:') ? '; Secure' : '') +
  (c.partitioned ? '; Partitioned' : '');
