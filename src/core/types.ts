/** Value of the `SameSite` cookie attribute. */
export type CookieSameSite = 'lax' | 'strict' | 'none';

/**
 * Cookie attributes for pref cookies. Prefs are never `HttpOnly`: the browser must
 * read and write them, so they are visible to any script on the page. Never store
 * secrets or session data in a pref. An option set to `undefined` counts as not set, so
 * the value comes from the level below: an earlier `.options()` call, the `definePrefs()`
 * options, then the default.
 */
export interface CookieOptions {
  /** @default '/' */
  path?: string | undefined;
  /** Omitted by default, which scopes the cookie to the current host. */
  domain?: string | undefined;
  /** Lifetime in seconds. Browsers cap it at 400 days. @default 34560000 (400 days) */
  maxAge?: number | undefined;
  /** @default 'lax' */
  sameSite?: CookieSameSite | undefined;
  /**
   * Send only over HTTPS. When unset, browser writes add `Secure` on `https:` pages
   * and `toCookie()` omits it.
   */
  secure?: boolean | undefined;
  /** CHIPS partitioned cookie. @default false */
  partitioned?: boolean | undefined;
}

/** Options for a whole set of prefs, passed to `definePrefs()`. */
export interface PrefsOptions extends CookieOptions {
  /**
   * Prepended to every cookie name. Use it to avoid collisions on a shared domain
   * (`'app.'`) or to opt into a cookie prefix (`'__Host-'`, which also needs
   * `secure: true` and no `domain`).
   * @default ''
   */
  prefix?: string | undefined;
}

/** Options for a single pref, passed to `.options()`. They override `PrefsOptions`. */
export interface PrefOptions extends CookieOptions {
  /**
   * Full cookie name for this pref. `prefix` is not applied to it. Must not be empty
   * (`definePrefs()` throws in development).
   * @default prefix + key
   */
  name?: string | undefined;
}

/**
 * A cookie ready to be set by a server framework. Structurally compatible with
 * Next.js `cookies().set(init)` and `ResponseCookies.set(init)`.
 */
export interface CookieInit {
  /** Cookie name, already URI-encoded (same as `Pref.name`). */
  name: string;
  /**
   * Serialized value, NOT URI-encoded: frameworks encode it on set (Next.js, Express
   * `res.cookie`). When writing a raw `Set-Cookie` header yourself, pass it through
   * `encodeURIComponent`, or cookie-prefs reads it as invalid and falls back to the default.
   */
  value: string;
  path: string;
  /**
   * Lifetime in seconds, like the `Max-Age` attribute and Next.js `cookies().set()`.
   * Express `res.cookie` takes milliseconds: pass `maxAge * 1000` there.
   */
  maxAge: number;
  sameSite: CookieSameSite;
  domain?: string;
  secure?: boolean;
  partitioned?: boolean;
}

/** Anything that can give a cookie value by name. `get` matches Next.js `cookies()` and `request.cookies`. */
export interface CookieGetter {
  get(name: string): { readonly value: string } | undefined;
}

/**
 * Where to read request cookies from on the server:
 * a `Cookie` header string, a cookie store with `get(name)` (Next.js `cookies()`,
 * `NextRequest.cookies`), or a plain name-to-value map. `null` and `undefined` read
 * as "no cookies", so every pref resolves to its default. A header string is
 * URI-decoded by cookie-prefs; stores and maps must already hold URI-decoded values, as
 * Next.js, Express and `snapshotPrefs()` do. Keys are cookie names (`Pref.name`).
 */
export type CookieSource =
  | string
  | CookieGetter
  | Readonly<Record<string, string | undefined>>
  | null
  | undefined;

/**
 * Raw cookie values of a set of prefs, keyed by cookie name (`Pref.name`). Values are
 * URI-decoded, like the values of a cookie store. Serializable, so it can cross the
 * Server Component to Client Component boundary. Holds only the prefs' own cookies,
 * never the rest of the request's cookies.
 */
export type PrefsSnapshot = Readonly<Record<string, string>>;

/** Where a pref is mirrored on `<html>`: a `data-*` attribute or a CSS custom property. */
export type ReflectTarget = `data-${string}` | `--${string}`;

/** Phantom type carrier: `T` is what you can write, `V` is what you read back. */
export interface PrefTypes<T, V> {
  readonly value: T;
  readonly output: V;
}

/**
 * An unbound pref definition, created by `pref.*`. Builders are immutable: every
 * method returns a new builder. Pass builders to `definePrefs()` to get handles.
 * `T` is the writable type, `V` the read type, `O` the parsed value type that
 * `.default()` takes. `O` differs from `T` only for `pref.json()` with a transforming
 * schema, which is written with the schema's input and read as its output.
 */
export interface PrefBuilder<T, V = T | undefined, O = T> {
  /** Type-only marker for inference. Never set at runtime. */
  readonly '~types'?: PrefTypes<T, V>;
  /** Value used when the cookie is missing or invalid. Removes `undefined` from the read type. */
  default(value: O): PrefBuilder<T, O, O>;
  /** Cookie name and attributes for this pref. */
  options(options: PrefOptions): PrefBuilder<T, V, O>;
}

/** Builder for `boolean`, `number` and `string` prefs, which can be mirrored on `<html>`. */
export interface ScalarPrefBuilder<T extends string | number | boolean, V = T | undefined>
  extends PrefBuilder<T, V> {
  default(value: T): ScalarPrefBuilder<T, T>;
  options(options: PrefOptions): ScalarPrefBuilder<T, V>;
  /**
   * Mirror the value on `<html>` before first paint (inline script) and after every
   * change. A missing cookie with no default removes the attribute. Changes from other
   * tabs show up at once while something in this tab subscribes to the pref
   * (`usePref`), otherwise when the tab becomes visible again (`PrefsProvider`).
   * @example pref.boolean().default(true).reflect('data-sidebar') // <html data-sidebar="true">
   */
  reflect(target: ReflectTarget | readonly ReflectTarget[]): ScalarPrefBuilder<T, V>;
}

/** Target accepted by `EnumPrefBuilder.reflect()`. `'class'` swaps one class per value. */
export type EnumReflectTarget = 'class' | ReflectTarget;

/** Builder for `pref.enum()`. */
export interface EnumPrefBuilder<T extends string, V = T | undefined> extends PrefBuilder<T, V> {
  /** The allowed values, in declaration order. */
  readonly values: readonly T[];
  default(value: T): EnumPrefBuilder<T, T>;
  options(options: PrefOptions): EnumPrefBuilder<T, V>;
  /**
   * Mirror the value on `<html>` before first paint (inline script) and after every
   * change. `'class'` adds the current value as a class and removes the others.
   * `value` maps a pref value to the string written to the DOM. Changes from other
   * tabs show up at once while something in this tab subscribes to the pref
   * (`usePref`), otherwise when the tab becomes visible again (`PrefsProvider`).
   * @example pref.enum(['compact', 'cozy']).default('cozy').reflect('data-density')
   */
  reflect(
    target: EnumReflectTarget | readonly EnumReflectTarget[],
    value?: Partial<Record<T, string>>,
  ): EnumPrefBuilder<T, V>;
  /**
   * Read old (renamed or removed) values as current ones: a cookie holding a key of
   * `map` reads as its value everywhere (`get()`, `read()`, `readPrefs`, hydration from
   * a snapshot, reflection and the inline script). Reads never rewrite the cookie; the
   * next `set()` writes the current name. One level only: a value must be a current
   * value, and a key must not be one (a current value always reads as itself).
   * Repeated calls add to the map.
   * @example pref.enum(['compact', 'comfortable']).default('comfortable').migrate({ cozy: 'comfortable' })
   */
  migrate<const M extends Readonly<Record<string, T>>>(
    map: M & { readonly [K in keyof M & T]?: never },
  ): EnumPrefBuilder<T, V>;
}

/** A custom codec for `pref.custom()`. */
export interface PrefCodec<T> {
  /** Raw cookie value (already URI-decoded) to a value. Return `undefined` or throw to fall back to the default. */
  parse(raw: string): T | undefined;
  /** Value to the raw cookie string (URI-encoded by cookie-prefs). */
  serialize(value: T): string;
}

/** Writes a pref: a value, or an updater that receives the current value. */
export type PrefSetter<T, V> = (value: T | ((prev: V) => T)) => void;

/**
 * A bound pref handle, one per key of `definePrefs()`. Usable outside React and
 * passed as-is to `usePref()`. `T` is the writable type, `V` the read type
 * (`T`, or `T | undefined` when there is no default).
 */
export interface Pref<T, V = T> {
  /** Type-only marker for inference. Never set at runtime. */
  readonly '~types'?: PrefTypes<T, V>;
  /** Key in the `definePrefs()` shape. */
  readonly key: string;
  /**
   * Cookie name (prefix + key, or the `name` option), URI-encoded: the exact name in
   * `document.cookie`, the `Cookie` header and `PrefsSnapshot` keys.
   */
  readonly name: string;
  /** Value returned when the cookie is missing or invalid. */
  readonly defaultValue: V;
  /**
   * Current value from `document.cookie`. Returns the default where there is no
   * DOM; on the server use `read()` instead. The same cookie returns the same object,
   * shared with every other reader: treat json and custom values as read-only.
   */
  get(): V;
  /** Write the cookie in the browser and notify subscribers in this and other tabs. No-op on the server. */
  set(value: T | ((prev: V) => T)): void;
  /** Delete the cookie, so the value goes back to the default. No-op on the server. */
  reset(): void;
  /**
   * Listen for changes from this tab and other tabs. Returns an unsubscribe function.
   * Listeners run synchronously, in subscription order. A listener that throws does not
   * stop the others and never makes `set()` or `reset()` throw: its error is thrown
   * again from a `setTimeout` callback, so it reaches the global error handler
   * (`window.onerror`, error monitoring) instead of being swallowed. A listener that
   * writes the pref notifies everyone of the new value at once; the rest of the older
   * round is skipped. Listeners are a set: the same function subscribed twice is called
   * once per change and removed by the first unsubscribe.
   */
  subscribe(listener: (value: V) => void): () => void;
  /**
   * Read the value from request cookies (stores and maps hold URI-decoded values).
   * Pure; never throws. In the browser, like `get()`, it is cached per raw string: the
   * same cookie returns the same object to every caller. Without a DOM (on the server)
   * every call parses again, so requests never share a parsed value. Treat json and
   * custom values, and the `.default()` value (always returned as is), as read-only:
   * copy them before changing anything.
   */
  read(source: CookieSource): V;
  /**
   * Build the cookie for a server-side write, e.g. `(await cookies()).set(prefs.locale.toCookie('de'))`.
   * `value` is not URI-encoded; frameworks encode it on set, raw `Set-Cookie` writers must.
   */
  toCookie(value: T): CookieInit;
}

/** Any bound pref handle. */
export type AnyPref = Pref<unknown, unknown>;

/** A record of bound handles, as returned by `definePrefs()`. */
export type PrefsRecord = Readonly<Record<string, AnyPref>>;

/** Any pref builder, as accepted by `definePrefs()`. */
export type AnyPrefBuilder = PrefBuilder<unknown, unknown>;

/** The shape passed to `definePrefs()`. */
export type PrefShape = Readonly<Record<string, AnyPrefBuilder>>;

/** Handles produced by `definePrefs()` from a shape. */
export type Prefs<S extends PrefShape> = {
  readonly [K in keyof S]: S[K] extends { readonly '~types'?: PrefTypes<infer T, infer V> }
    ? Pref<T, V>
    : never;
};

/** Read type of a single pref handle or builder. */
export type PrefValue<P extends { readonly '~types'?: PrefTypes<unknown, unknown> }> =
  NonNullable<P['~types']>['output'];

/** Read types of a record of pref handles: `{ theme: 'light' | 'dark', ... }`. */
export type PrefValues<P extends PrefsRecord> = { [K in keyof P]: PrefValue<P[K]> };
