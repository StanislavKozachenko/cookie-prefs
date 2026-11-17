import { builder, type Def } from './core/builder';
import { rawOf } from './core/cookie';
import { script, type Reflection } from './core/reflect';
import type { InferSchemaInput, InferSchemaOutput, StandardSchemaV1 } from './core/standard-schema';
import { bind, REFLECTION } from './core/store';
import type {
  CookieSource,
  EnumPrefBuilder,
  PrefBuilder,
  PrefCodec,
  Prefs,
  PrefShape,
  PrefsOptions,
  PrefsRecord,
  PrefsSnapshot,
  PrefValues,
  ScalarPrefBuilder,
} from './core/types';

export type {
  AnyPref,
  AnyPrefBuilder,
  CookieGetter,
  CookieInit,
  CookieOptions,
  CookieSameSite,
  CookieSource,
  EnumPrefBuilder,
  EnumReflectTarget,
  Pref,
  PrefBuilder,
  PrefCodec,
  PrefOptions,
  Prefs,
  PrefSetter,
  PrefShape,
  PrefsOptions,
  PrefsRecord,
  PrefsSnapshot,
  PrefTypes,
  PrefValue,
  PrefValues,
  ReflectTarget,
  ScalarPrefBuilder,
} from './core/types';
export type { StandardSchemaV1 } from './core/standard-schema';

/** Pref builders. Each returns an immutable builder to pass to `definePrefs()`. */
export interface PrefFactory {
  /**
   * One of a fixed list of strings, stored as is. Any other cookie value reads as the default.
   * @example pref.enum(['light', 'dark', 'system']).default('system')
   */
  enum<const T extends readonly [string, ...string[]]>(
    values: T,
  ): EnumPrefBuilder<T[number], T[number] | undefined>;
  /**
   * `true` or `false`, stored as `'true'` / `'false'`.
   * @example pref.boolean().default(true)
   */
  boolean(): ScalarPrefBuilder<boolean>;
  /**
   * A finite number. `NaN` and `Infinity` read as the default.
   * @example pref.number().default(25)
   */
  number(): ScalarPrefBuilder<number>;
  /**
   * Any string, stored URI-encoded.
   * @example pref.string() // string | undefined
   */
  string(): ScalarPrefBuilder<string>;
  /**
   * A JSON value checked by any Standard Schema validator (zod, valibot, arktype).
   * Validation must be synchronous; a schema that returns a Promise reads as the default.
   * Writes take the schema's input (it is stored as JSON and validated on read), reads
   * and `.default()` its output; they differ only for transforming schemas.
   * @example pref.json(z.array(z.string())).default([])
   */
  json<S extends StandardSchemaV1>(
    schema: S,
  ): PrefBuilder<
    Exclude<InferSchemaInput<S>, undefined>,
    InferSchemaOutput<S> | undefined,
    InferSchemaOutput<S>
  >;
  /**
   * Your own codec. `parse` returning `undefined` or throwing reads as the default.
   * @example pref.custom({ parse: (raw) => new Date(raw), serialize: (d) => d.toISOString() })
   */
  custom<T>(codec: PrefCodec<T>): PrefBuilder<T>;
}

/**
 * Pref builders.
 * @example
 * const prefs = definePrefs({
 *   theme: pref.enum(['light', 'dark', 'system']).default('system'),
 *   sidebar: pref.boolean().default(true),
 * })
 */
export const pref: PrefFactory = {
  enum: (values) =>
    builder({ values, p: (raw) => (values.includes(raw) ? raw : undefined), s: String }),
  boolean: () =>
    builder({
      k: { true: 'true', false: 'false' },
      p: (raw) => raw == 'true' || (raw == 'false' ? false : undefined),
      s: String,
    }),
  number: () =>
    builder({
      k: 1,
      p: (raw) => {
        const n = parseFloat(raw);
        return n === +raw && isFinite(n) ? n : undefined;
      },
      s: String,
    }),
  string: () => builder({ k: 0, p: (raw) => raw, s: String }),
  json: (schema) =>
    builder({
      p: (raw) => {
        const result = schema['~standard'].validate(JSON.parse(raw));
        return 'then' in result || result.issues ? undefined : result.value;
      },
      s: JSON.stringify,
    }),
  custom: (codec) =>
    builder({ p: (raw) => codec.parse(raw), s: (value) => codec.serialize(value as never) }),
};

/**
 * Bind pref builders to cookie names (`prefix + key`) and return one handle per key.
 * Each pref is its own cookie. Call once at module level and import the result in
 * both server and client code.
 * @example
 * export const prefs = definePrefs(
 *   {
 *     theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class'),
 *     sidebar: pref.boolean().default(true),
 *   },
 *   { prefix: 'app.' },
 * )
 * prefs.sidebar.set((open) => !open)
 */
export function definePrefs<S extends PrefShape>(shape: S, options?: PrefsOptions): Prefs<S>;
export function definePrefs(shape: PrefShape, { prefix, ...options }: PrefsOptions = {}) {
  const prefs: Record<string, unknown> = {};
  for (const key in shape) prefs[key] = bind(key, shape[key] as unknown as Def, prefix ?? '', options);
  return prefs as never;
}

/**
 * Read typed values of all prefs from request cookies. Pure; never throws.
 * @example
 * const { theme, sidebar } = readPrefs(prefs, request.headers.get('cookie'))
 */
export function readPrefs<P extends PrefsRecord>(prefs: P, source: CookieSource): PrefValues<P>;
export function readPrefs(prefs: PrefsRecord, source: CookieSource) {
  const values: Record<string, unknown> = {};
  for (const key in prefs) values[key] = prefs[key]!.read(source);
  return values as never;
}

/**
 * Pick the raw cookie values of these prefs from request cookies, for
 * `<PrefsProvider snapshot>`. Only the prefs' own cookies are copied, keyed by
 * `Pref.name`, with URI-decoded values.
 * @example
 * <PrefsProvider snapshot={snapshotPrefs(prefs, request.headers.get('cookie'))}>
 */
export function snapshotPrefs(prefs: PrefsRecord, source: CookieSource): PrefsSnapshot;
export function snapshotPrefs(prefs: PrefsRecord, source: CookieSource): PrefsSnapshot {
  const snapshot: Record<string, string> = {};
  for (const { name } of Object.values(prefs)) {
    try {
      const raw = rawOf(source, name);
      if (typeof raw == 'string') snapshot[name] = raw;
    } catch {
      // malformed value: leave it out, the client reads the default
    }
  }
  return snapshot;
}

/**
 * Source of a blocking inline script that applies every `.reflect()` declaration to
 * `<html>` from `document.cookie` before first paint. Returns `''` when no pref
 * reflects. The output is fixed code plus escaped JSON config, safe to inline.
 * @example
 * <script nonce={nonce} dangerouslySetInnerHTML={{ __html: prefsScript(prefs) }} />
 */
export function prefsScript(prefs: PrefsRecord): string;
export function prefsScript(prefs: PrefsRecord): string {
  return script(
    Object.values(prefs)
      .map((handle) => (handle as { [REFLECTION]?: Reflection })[REFLECTION])
      .filter((r): r is Reflection => !!r),
  );
}
