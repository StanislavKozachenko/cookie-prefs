import type { Def } from './builder';
import { defaults, merge, rawOf, serialize } from './cookie';
import { apply, domOf, type Reflection } from './reflect';
import { hub, post } from './sync';
import type { CookieInit, CookieOptions, CookieSource, PrefOptions } from './types';

/**
 * Key of a handle's reflection config, for `prefsScript()`. Kept on the handle under a
 * global symbol, not in a module-level map, so a second copy of the core (ESM + CJS,
 * two versions) reads it too. Bump the suffix when the `Reflection` layout changes.
 */
export const REFLECTION = Symbol.for('cookie-prefs.reflection.1');

/** Turn a builder into a `Pref` handle (typed by the caller). */
export const bind = (key: string, def: Def, prefix: string, options: CookieOptions) => {
  const name = encodeURIComponent(def.o?.name ?? prefix + key);
  const attrs = merge<PrefOptions>(defaults, options, def.o, { name }) as Omit<CookieInit, 'value'>;
  const fallback = def.d;
  const targets = def.r;
  // Value map read by own keys, like the inline script: an enum value named `toString`
  // must not pick up `Object.prototype.toString`.
  const kind = def.values
    ? Object.fromEntries(def.values.map((v) => [v, merge<Record<string, string>>({ [v]: v }, def.m)[v]!]))
    : def.k;
  // Dev only (dropped from production builds): `classList` rejects an empty token or one
  // with whitespace, so such a class would never be applied, by the client or the script.
  if (
    typeof process == 'object' &&
    process.env.NODE_ENV != 'production' &&
    targets?.includes('class') &&
    Object.values({ ...(kind as object) }).some((c) => !/^[^\t\n\f\r ]+$/.test(c as string))
  )
    throw TypeError(`cookie-prefs: ${key}.reflect('class') needs non-empty classes without whitespace`);
  // Parsed value per raw string, so reads are referentially stable. Bounded, since
  // on the server raw strings come from arbitrary requests.
  const cache = new Map<string, unknown>();
  const listeners = new Set<(value: unknown) => void>();
  let last: unknown;

  const read = (source: CookieSource): unknown => {
    try {
      const raw = rawOf(source, name);
      if (typeof raw == 'string' && raw.length <= 4096) {
        if (!cache.has(raw)) {
          if (cache.size > 9) cache.clear();
          cache.set(raw, def.p(raw));
        }
        const value = cache.get(raw);
        if (value !== undefined) return value;
      }
    } catch {
      // malformed encoding, parser or schema error: default
    }
    return fallback;
  };

  let warned = false;
  const get = () => {
    try {
      return read(document.cookie);
    } catch {
      // no DOM, or a sandboxed iframe where reading `document.cookie` throws
    }
    // Dev only. `process` is checked first so runtimes without it never throw.
    if (typeof process == 'object' && process.env.NODE_ENV != 'production' && !warned) {
      warned = true;
      console.warn(
        `cookie-prefs: ${key}.get() cannot read document.cookie here and returns the default. On the server use read() or getPrefs().`,
      );
    }
    return fallback;
  };

  // Update `<html>` every time: while nothing subscribes `last` goes stale as the
  // provider, other tabs or the server move the DOM. Notify only when the value differs.
  const check = () => {
    const value = get();
    if (targets) apply(targets, kind, domOf(kind, value));
    if (!Object.is(value, last)) {
      last = value;
      listeners.forEach((listener) => listener(value));
    }
  };

  const write = (value?: string) => {
    try {
      document.cookie = serialize(attrs, value);
      post();
    } catch {
      // sandboxed iframe (`document.cookie` throws), or a lone surrogate without
      // `toWellFormed` (see `serialize`): nothing is written
    }
    check();
  };

  const handle = {
    key,
    name,
    defaultValue: fallback,
    get,
    set: (value: unknown) => {
      if (typeof document != 'undefined') write(def.s(typeof value == 'function' ? value(get()) : value));
    },
    reset: () => {
      if (typeof document != 'undefined') write();
    },
    subscribe: (listener: (value: unknown) => void) => {
      if (typeof document == 'undefined') return () => {};
      if (!listeners.size) {
        hub(check, true);
        check();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) hub(check, false);
      };
    },
    read,
    toCookie: (value: unknown) => ({ ...attrs, value: def.s(value) }),
  };
  // Non-enumerable: not copied by spreads, not part of the public types.
  if (targets)
    Object.defineProperty(handle, REFLECTION, {
      value: [name, targets, kind, domOf(kind, fallback)] satisfies Reflection,
    });
  return handle;
};
