import type { Def } from './builder';
import { defaults, merge, rawOf, serialize } from './cookie';
import { apply, domOf, type Reflection } from './reflect';
import { hub, post } from './sync';
import type { CookieInit, CookieOptions, CookieSource, PrefOptions } from './types';

/**
 * Key of a handle's reflection config, for `prefsScript()` (`src/script/index.ts`
 * repeats it). Kept on the handle under a global symbol, not in a module-level map, so
 * the script entry and a second copy of the core (ESM + CJS, two versions) read it too.
 * Bump the suffix in both places when the `Reflection` layout changes.
 */
const REFLECTION = Symbol.for('cookie-prefs.reflection.1');

/** Turn a builder into a `Pref` handle (typed by the caller). */
export const bind = (key: string, def: Def, prefix: string, options: CookieOptions) => {
  const name = encodeURIComponent(def.o?.name ?? prefix + key);
  const attrs = merge<PrefOptions>(defaults, options, def.o, { name }) as Omit<CookieInit, 'value'>;
  const fallback = def.d;
  const targets = def.r;
  // Enums: each valid raw value to its value, so an old name from `.migrate()` reads as
  // its current value. Current values come last, so each reads as itself even when the
  // map has it as a key; an old name mapped to anything but a current value is dropped.
  // A `Map`, so `toString` or a polluted `Object.prototype` is never a valid raw value.
  const values = def.values;
  const enums =
    values &&
    new Map(
      Object.entries({ ...def.a })
        .filter((e) => values.includes(e[1]))
        .concat(values.map((v) => [v, v])),
    );
  // Value map read by own keys, like the inline script: an enum value named `toString`
  // must not pick up `Object.prototype.toString`. Old names map to the DOM string of
  // their current value, so the script and `apply` migrate without knowing about it.
  const kind = enums
    ? Object.fromEntries(
        [...enums].map(([raw, v]) => [raw, merge<Record<string, string>>({ [v]: v }, def.m)[v]!]),
      )
    : def.k;
  const parse = enums ? (raw: string) => enums.get(raw) : def.p!;
  // Dev only (dropped from production builds). A cookie with an empty name is written
  // as a bare value, which no read path takes for a cookie of any name. `classList`
  // rejects an empty token or one with whitespace, so such a class would never be
  // applied, by the client or the script.
  if (typeof process == 'object' && process.env.NODE_ENV != 'production') {
    if (!name) throw TypeError(`cookie-prefs: ${key} needs a non-empty cookie name`);
    if (
      targets?.includes('class') &&
      Object.values({ ...(kind as object) }).some((c) => !/^[^\t\n\f\r ]+$/.test(c as string))
    )
      throw TypeError(`cookie-prefs: ${key}.reflect('class') needs non-empty classes without whitespace`);
  }
  // Parsed value per raw string, so reads in the browser are referentially stable
  // (`useSyncExternalStore`, hydration from a snapshot). Bounded. Without a DOM every
  // read parses again: a json or custom value is an object that one request could
  // mutate, and a cached one would be handed to the next request.
  const cache = new Map<string, unknown>();
  const listeners = new Set<(value: unknown) => void>();
  let last: unknown;

  const read = (source: CookieSource): unknown => {
    try {
      const raw = rawOf(source, name);
      if (typeof raw == 'string' && raw.length <= 4096) {
        if (!cache.has(raw) || typeof document == 'undefined') {
          if (cache.size > 9) cache.clear();
          cache.set(raw, parse(raw));
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
  // A listener's error is thrown again from a timer: it reaches the global error
  // handler without skipping the other listeners or failing `set()` and the hub.
  const check = () => {
    const value = get();
    if (targets) apply(targets, kind, domOf(kind, value));
    if (!Object.is(value, last)) {
      last = value;
      listeners.forEach((listener) => {
        // Once a listener has written the pref, the nested check delivered the newer
        // value to everyone: skip this outdated one.
        if (Object.is(value, last))
          try {
            listener(value);
          } catch (e) {
            setTimeout(() => {
              throw e;
            });
          }
      });
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
