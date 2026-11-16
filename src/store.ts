import type { Def } from './builder';
import { defaults, rawOf, serialize } from './cookie';
import { apply, domOf, type Reflection } from './reflect';
import { hub, post } from './sync';
import type { CookieOptions, CookieSource } from './types';

/**
 * Key of a handle's reflection config, for `prefsScript()`. Kept on the handle under a
 * global symbol, not in a module-level map, so a second copy of the core (ESM + CJS,
 * two versions) reads it too. Bump the suffix when the `Reflection` layout changes.
 */
export const REFLECTION = Symbol.for('prefkit.reflection.1');

const NONE = {};
const hasDom = () => typeof document != 'undefined';

/** Turn a builder into a `Pref` handle (typed by the caller). */
export const bind = (key: string, def: Def, prefix: string, options: CookieOptions) => {
  const name = encodeURIComponent(def.o?.name ?? prefix + key);
  const attrs = { ...defaults, ...options, ...def.o, name };
  const fallback = def.d;
  const targets = def.r;
  const kind = def.values
    ? Object.fromEntries(def.values.map((v) => [v, def.m?.[v] ?? v]))
    : def.k;
  // Parsed value per raw string, so reads are referentially stable. Bounded, since
  // on the server raw strings come from arbitrary requests.
  const cache = new Map<string, unknown>();
  const listeners = new Set<(value: unknown) => void>();
  let last: unknown = NONE;

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
    if (hasDom()) return read(document.cookie);
    // Dev only. `process` is checked first so runtimes without it never throw.
    if (typeof process == 'object' && process.env.NODE_ENV != 'production' && !warned) {
      warned = true;
      console.warn(
        `prefkit: ${key}.get() has no DOM here and returns the default. On the server use read() or getPrefs().`,
      );
    }
    return fallback;
  };

  // Notify listeners and update `<html>` when the value differs from the last one seen.
  const check = () => {
    const value = get();
    if (!Object.is(value, last)) {
      last = value;
      if (targets) apply(targets, kind, domOf(kind, value));
      listeners.forEach((listener) => listener(value));
    }
  };

  const write = (value?: string) => {
    document.cookie = serialize(attrs, value);
    post();
    check();
  };

  const handle = {
    key,
    name,
    defaultValue: fallback,
    get,
    set: (value: unknown) => {
      if (hasDom()) write(def.s(typeof value == 'function' ? value(get()) : value));
    },
    reset: () => {
      if (hasDom()) write();
    },
    subscribe: (listener: (value: unknown) => void) => {
      if (!hasDom()) return () => {};
      if (!listeners.size) {
        hub(check, true);
        last = NONE;
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
