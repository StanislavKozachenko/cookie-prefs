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
      // Name, `=` and value of one pair. Like browsers, only spaces and tabs around the
      // name and the value are dropped, never other whitespace (U+00A0, U+2028, U+FEFF),
      // so a header reads like `document.cookie` in the client, the inline script and
      // `reapply`. Every group may be empty, so the match never fails and never
      // backtracks over a long run of spaces: linear in the length of the part.
      const m = /^[\t ]*((?:[\t ]*[^\t =]+)*)[\t ]*(=?)[\t ]*((?:[\t ]*[^\t ]+)*)/.exec(part)!;
      if (m[2] && m[1] == name) return decodeURIComponent(m[3]!.replace(/^"(.*)"$/, '$1'));
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
