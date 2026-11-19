// Compile-time contract for the public API. Checked by `npm run typecheck`; never executed.
import type { cookies } from 'next/headers';
import { expectTypeOf } from 'vitest';
import * as z from 'zod';
import {
  definePrefs,
  pref,
  readPrefs,
  snapshotPrefs,
  type CookieInit,
  type CookieOptions,
  type CookieSameSite,
  type Pref,
  type PrefOptions,
  type PrefsOptions,
  type PrefsRecord,
  type PrefsSnapshot,
  type PrefValue,
  type PrefValues,
} from '../../index';
import {
  getPrefs,
  PrefsProvider as NextPrefsProvider,
  type NextPrefsProviderProps,
} from '../../next/index';
import * as core from '../../index';
import { PrefsProvider, usePref, usePrefs, type PrefSetter, type PrefsSetter } from '../../react/index';
import { prefsScript } from '../../script/index';
import { ThemeProvider, useTheme, type ThemeProviderProps, type UseThemeProps } from '../../theme/index';
import { getTheme, type ThemeOptions as NextThemeOptions } from '../../theme/next/index';
import { readTheme, type ThemeOptions } from '../../theme/server/index';

const prefs = definePrefs({
  theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class'),
  density: pref
    .enum(['compact', 'cozy'])
    .reflect(['data-density', '--density'], { compact: 'c' })
    .default('cozy'),
  sidebar: pref.boolean().default(true).reflect('data-sidebar'),
  pageSize: pref.number().default(25).options({ maxAge: 60 }),
  locale: pref.string(),
  columns: pref.json(z.array(z.string())).default([]),
  filters: pref.json(z.object({ q: z.string(), page: z.number() })),
  since: pref.custom({ parse: (raw) => new Date(raw), serialize: (d: Date) => d.toISOString() }),
});

// Parsers infer the value type; `.default()` removes `undefined`, in any position of the chain.
expectTypeOf(prefs.theme.get()).toEqualTypeOf<'light' | 'dark' | 'system'>();
expectTypeOf(prefs.density.get()).toEqualTypeOf<'compact' | 'cozy'>();
expectTypeOf(prefs.sidebar.get()).toEqualTypeOf<boolean>();
expectTypeOf(prefs.pageSize.get()).toEqualTypeOf<number>();
expectTypeOf(prefs.locale.get()).toEqualTypeOf<string | undefined>();
expectTypeOf(prefs.since.get()).toEqualTypeOf<Date | undefined>();

// Standard Schema inference.
expectTypeOf(prefs.columns.get()).toEqualTypeOf<string[]>();
expectTypeOf(prefs.filters.get()).toEqualTypeOf<{ q: string; page: number } | undefined>();
expectTypeOf(prefs.columns).toEqualTypeOf<Pref<string[], string[]>>();
expectTypeOf(prefs.filters).toEqualTypeOf<
  Pref<{ q: string; page: number }, { q: string; page: number } | undefined>
>();
prefs.columns.set((columns) => [...columns, 'name']);

// `pref.json` stores `JSON.stringify(value)` and validates it on read, so writes take the
// schema's input; reads, the updater's `prev` and `.default()` (returned as is) its output.
const csv = z.string().transform((s) => s.split(','));
const json = definePrefs({
  tags: pref.json(csv).default([]),
  maybeTags: pref.json(csv),
  note: pref.json(z.string().optional()),
});
expectTypeOf(json.tags).toEqualTypeOf<Pref<string, string[]>>();
expectTypeOf(json.maybeTags).toEqualTypeOf<Pref<string, string[] | undefined>>();
expectTypeOf(json.tags.get()).toEqualTypeOf<string[]>();
json.tags.set('a,b');
json.tags.set((tags) => [...tags, 'c'].join(','));
json.maybeTags.set((tags) => (tags ?? []).join(','));
expectTypeOf(json.tags.toCookie).parameter(0).toEqualTypeOf<string>();
expectTypeOf(usePref(json.tags)[1]).toEqualTypeOf<PrefSetter<string, string[]>>();
// @ts-expect-error the output is not valid schema input: it would read back as the default
json.tags.set(['a', 'b']);
// @ts-expect-error the updater must return schema input
json.tags.set((tags) => tags);
// @ts-expect-error the default is returned as is, so it is an output value
pref.json(csv).default('a,b');
// @ts-expect-error clear with reset(), not undefined
json.note.set(undefined);

// Handles are fully typed `Pref<T, V>`.
expectTypeOf(prefs.theme).toEqualTypeOf<
  Pref<'light' | 'dark' | 'system', 'light' | 'dark' | 'system'>
>();
expectTypeOf(prefs.locale).toEqualTypeOf<Pref<string, string | undefined>>();
expectTypeOf<PrefValue<typeof prefs.theme>>().toEqualTypeOf<'light' | 'dark' | 'system'>();

// Setter takes a value or an updater; it never takes `undefined` (use `reset()`).
prefs.theme.set('dark');
prefs.pageSize.set((n) => n + 25);
prefs.locale.set((prev) => prev ?? 'en');
prefs.locale.reset();
// @ts-expect-error not one of the enum values
prefs.theme.set('blue');
// @ts-expect-error clear with reset(), not undefined
prefs.locale.set(undefined);
// @ts-expect-error `class` reflection is only for enums
pref.boolean().reflect('class');
// @ts-expect-error reflect targets are `data-*` or `--*`
pref.string().reflect('title');
// @ts-expect-error json prefs cannot be reflected
pref.json(z.string()).reflect('data-x');
// @ts-expect-error default must match the enum
pref.enum(['a', 'b']).default('c');

// `.migrate()`: enums only, old names to current values, chainable in any order.
const migrated = definePrefs({
  density: pref.enum(['compact', 'comfortable']).default('comfortable').migrate({ cozy: 'comfortable' }),
  mode: pref
    .enum(['a', 'b'])
    .migrate({ old: 'a', older: 'b' })
    .reflect('class')
    .options({ maxAge: 60 })
    .migrate({ x: 'b' }),
  // a map with keys named like `Object.prototype` members, and an enum with such a value
  proto: pref.enum(['toString', 'b']).migrate({ ['__proto__']: 'b', constructor: 'toString', x: 'b' }),
});
expectTypeOf(migrated.density).toEqualTypeOf<Pref<'compact' | 'comfortable', 'compact' | 'comfortable'>>();
expectTypeOf(migrated.mode).toEqualTypeOf<Pref<'a' | 'b', 'a' | 'b' | undefined>>();
expectTypeOf(migrated.proto.get()).toEqualTypeOf<'toString' | 'b' | undefined>();
expectTypeOf(pref.enum(['a', 'b']).migrate({ old: 'a' }).values).toEqualTypeOf<readonly ('a' | 'b')[]>();
declare const wide: Record<string, 'a'>;
pref.enum(['a', 'b']).migrate(wide);
pref.enum(['a', 'b']).migrate({});
// @ts-expect-error values must be current values
pref.enum(['a', 'b']).migrate({ old: 'c' });
// @ts-expect-error a key must not be a current value: it always reads as itself
pref.enum(['a', 'b']).migrate({ a: 'b' });
// @ts-expect-error not even mapped to itself
pref.enum(['a', 'b']).default('a').migrate({ b: 'b', old: 'a' });
// @ts-expect-error a value cannot be undefined
pref.enum(['a', 'b']).migrate({ old: undefined });
// @ts-expect-error no chains: a value cannot be another old name
pref.enum(['a', 'b']).migrate({ older: 'old', old: 'a' });
// @ts-expect-error only enums migrate
pref.boolean().migrate({ yes: 'true' });
// @ts-expect-error only enums migrate
pref.number().default(1).migrate({});
// @ts-expect-error only enums migrate
pref.string().migrate({});
// @ts-expect-error only enums migrate
pref.json(z.string()).migrate({});
// @ts-expect-error only enums migrate
pref.custom({ parse: (raw) => raw, serialize: String }).migrate({});

// Server reads.
const values = readPrefs(prefs, 'theme=dark; app.sidebar=false');
expectTypeOf(values).toEqualTypeOf<PrefValues<typeof prefs>>();
expectTypeOf(values.theme).toEqualTypeOf<'light' | 'dark' | 'system'>();
expectTypeOf(values.locale).toEqualTypeOf<string | undefined>();
expectTypeOf(snapshotPrefs(prefs, { theme: 'dark' })).toEqualTypeOf<PrefsSnapshot>();
expectTypeOf(prefs.sidebar.read(null)).toEqualTypeOf<boolean>();

// Pre-paint script: its own entry, `cookie-prefs/script`, so the core does not carry it.
expectTypeOf(prefsScript).toEqualTypeOf<(prefs: PrefsRecord) => string>();
expectTypeOf(prefsScript(prefs)).toEqualTypeOf<string>();
expectTypeOf(core).not.toHaveProperty('prefsScript');

// Next.js cookie stores are valid sources and sinks.
declare const nextCookies: Awaited<ReturnType<typeof cookies>>;
readPrefs(prefs, nextCookies);
nextCookies.set(prefs.locale.toCookie('de'));
expectTypeOf(prefs.locale.toCookie('de')).toEqualTypeOf<CookieInit>();

// Cookie options take an explicit `undefined` ("not set") under `exactOptionalPropertyTypes`,
// so optional values pass through without conditional spreads.
declare const maybeString: string | undefined;
declare const maybeNumber: number | undefined;
declare const maybeSameSite: CookieSameSite | undefined;
declare const maybeBoolean: boolean | undefined;
const cookieOptions: CookieOptions = {
  path: maybeString,
  domain: maybeString,
  maxAge: maybeNumber,
  sameSite: maybeSameSite,
  secure: maybeBoolean,
  partitioned: maybeBoolean,
};
const prefsOptions: PrefsOptions = { ...cookieOptions, prefix: maybeString };
const prefOptions: PrefOptions = { ...cookieOptions, name: maybeString };
definePrefs({ a: pref.string().options(prefOptions), b: pref.number().options({ domain: maybeString }) }, prefsOptions);
definePrefs({}, { domain: maybeString, prefix: undefined });
// `toCookie()` never returns `undefined` attributes, so `CookieInit` stays exact.
// @ts-expect-error `CookieInit` optional fields are never `undefined`
const exactInit: CookieInit = { name: 'a', value: '', path: '/', maxAge: 1, sameSite: 'lax', domain: maybeString };
void exactInit;

// React hook: useState-like tuple.
const [theme, setTheme] = usePref(prefs.theme);
expectTypeOf(theme).toEqualTypeOf<'light' | 'dark' | 'system'>();
expectTypeOf(setTheme).toEqualTypeOf<
  PrefSetter<'light' | 'dark' | 'system', 'light' | 'dark' | 'system'>
>();
setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
const [locale] = usePref(prefs.locale);
expectTypeOf(locale).toEqualTypeOf<string | undefined>();
expectTypeOf(PrefsProvider).parameter(0).toHaveProperty('snapshot');

// Batch hook: values typed like `readPrefs`, a partial patch typed per key like each setter.
const [all, setAll] = usePrefs(prefs);
expectTypeOf(all).toEqualTypeOf<PrefValues<typeof prefs>>();
expectTypeOf(all.theme).toEqualTypeOf<'light' | 'dark' | 'system'>();
expectTypeOf(all.locale).toEqualTypeOf<string | undefined>();
expectTypeOf(setAll).toEqualTypeOf<PrefsSetter<typeof prefs>>();
setAll({});
setAll({ theme: 'dark', sidebar: (open) => !open, columns: ['a'] });
setAll({
  locale: (prev) => {
    expectTypeOf(prev).toEqualTypeOf<string | undefined>();
    return prev ?? 'de';
  },
});
setAll({ pageSize: (n) => n + 1, since: new Date(), filters: { q: '', page: 1 } });
// @ts-expect-error a value outside the enum
setAll({ theme: 'blue' });
// @ts-expect-error a value of another type
setAll({ sidebar: 'yes' });
// @ts-expect-error an updater must return the pref's type
setAll({ pageSize: (n) => String(n) });
// @ts-expect-error a key the record does not have
setAll({ colour: 'red' });
// @ts-expect-error clear with `reset()`, not `undefined` (under `exactOptionalPropertyTypes`)
setAll({ locale: undefined });
// A sub-record of handles, and a transforming schema: written with its input, read as its output.
const { stamp } = definePrefs({ stamp: pref.json(z.string().transform((s) => s.length)).default(0) });
const [sub, setSub] = usePrefs({ theme: prefs.theme, stamp });
expectTypeOf(sub).toEqualTypeOf<{ theme: 'light' | 'dark' | 'system'; stamp: number }>();
setSub({ stamp: 'abc' });
setSub({ stamp: (prev) => String(prev) });
// @ts-expect-error writes take the schema input
setSub({ stamp: 3 });
// @ts-expect-error not part of the sub-record
setSub({ sidebar: false });
// @ts-expect-error a record of handles only
usePrefs({ theme: pref.enum(['a']) });

// Next.js server API.
expectTypeOf(getPrefs(prefs)).resolves.toEqualTypeOf<PrefValues<typeof prefs>>();
expectTypeOf(NextPrefsProvider<typeof prefs>)
  .parameter(0)
  .toHaveProperty('mode')
  .toEqualTypeOf<'script' | 'server' | undefined>();
// Optional props take an explicit `undefined` under `exactOptionalPropertyTypes`.
declare const maybeNonce: string | undefined;
declare const maybeMode: 'script' | 'server' | undefined;
const nextProps: NextPrefsProviderProps<typeof prefs> = { prefs, mode: maybeMode, nonce: maybeNonce };
void NextPrefsProvider(nextProps);

// Theme preset: next-themes compatible.
expectTypeOf(useTheme()).toEqualTypeOf<UseThemeProps>();
expectTypeOf(useTheme().theme).toEqualTypeOf<string | undefined>();
expectTypeOf(useTheme().resolvedTheme).toEqualTypeOf<string | undefined>();
expectTypeOf(useTheme().systemTheme).toEqualTypeOf<'light' | 'dark' | undefined>();
expectTypeOf(useTheme().themes).toEqualTypeOf<string[]>();
useTheme().setTheme('dark');
useTheme().setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
expectTypeOf(useTheme<'light' | 'dark'>().theme).toEqualTypeOf<
  'light' | 'dark' | 'system' | undefined
>();
expectTypeOf(useTheme<'light' | 'dark'>().resolvedTheme).toEqualTypeOf<
  'light' | 'dark' | undefined
>();
expectTypeOf(ThemeProvider).parameter(0).toEqualTypeOf<ThemeProviderProps>();
const themeProps: ThemeProviderProps = {
  attribute: ['class', 'data-theme'],
  defaultTheme: 'system',
  enableSystem: true,
  enableColorScheme: true,
  disableTransitionOnChange: true,
  themes: ['light', 'dark'],
  forcedTheme: 'dark',
  value: { dark: 'dark-mode' },
  storageKey: 'theme',
  nonce: 'abc',
  scriptProps: { 'data-cfasync': 'false' },
};
expectTypeOf(themeProps).toExtend<ThemeProviderProps>();

// Theme on the server: the stored name, `'system'` included; a literal `themes` tuple narrows it.
expectTypeOf(readTheme('theme=dark')).toEqualTypeOf<string>();
expectTypeOf(readTheme(null, { defaultTheme: 'dark' })).toEqualTypeOf<string>();
expectTypeOf(readTheme('', { themes: ['light', 'dark'] })).toEqualTypeOf<'light' | 'dark' | 'system'>();
const tuple = ['light', 'dark', 'sepia'] as const;
expectTypeOf(readTheme('', { themes: tuple, defaultTheme: 'sepia' })).toEqualTypeOf<
  'light' | 'dark' | 'sepia' | 'system'
>();
declare const names: string[];
expectTypeOf(readTheme('', { themes: names })).toEqualTypeOf<string>();
readTheme(new Map([['theme', { value: 'dark' }]]));
readTheme({ theme: 'dark' }, { storageKey: 'theme', enableSystem: false, value: { dark: 'd' } });
// with a literal list, the default and the `value` keys must be listed (or 'system')
readTheme('', { themes: ['light', 'dark'], defaultTheme: 'system', value: { dark: 'd', system: 's' } });
// @ts-expect-error not one of `themes`
readTheme('', { themes: ['light', 'dark'], defaultTheme: 'sepia' });
// @ts-expect-error a `value` key outside `themes` would widen the result
readTheme('', { themes: ['light', 'dark'], value: { pink: 'p' } });
// one config object for the provider and the server
expectTypeOf(readTheme('', themeProps)).toEqualTypeOf<string>();
expectTypeOf(getTheme(themeProps)).toEqualTypeOf<Promise<string>>();
expectTypeOf(getTheme()).toEqualTypeOf<Promise<string>>();
expectTypeOf(getTheme({ themes: ['light', 'dark'] })).toEqualTypeOf<Promise<'light' | 'dark' | 'system'>>();
expectTypeOf<NextThemeOptions>().toEqualTypeOf<ThemeOptions>();
expectTypeOf<ThemeOptions<'a'>['themes']>().toEqualTypeOf<readonly 'a'[] | undefined>();
