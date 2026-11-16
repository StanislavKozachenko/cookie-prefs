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
  type Pref,
  type PrefsSnapshot,
  type PrefValue,
  type PrefValues,
} from './index';
import { getPrefs, PrefsProvider as NextPrefsProvider } from './next/index';
import { PrefsProvider, usePref, type PrefSetter } from './react/index';
import { ThemeProvider, useTheme, type ThemeProviderProps, type UseThemeProps } from './theme/index';

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

// Server reads.
const values = readPrefs(prefs, 'theme=dark; app.sidebar=false');
expectTypeOf(values).toEqualTypeOf<PrefValues<typeof prefs>>();
expectTypeOf(values.theme).toEqualTypeOf<'light' | 'dark' | 'system'>();
expectTypeOf(values.locale).toEqualTypeOf<string | undefined>();
expectTypeOf(snapshotPrefs(prefs, { theme: 'dark' })).toEqualTypeOf<PrefsSnapshot>();
expectTypeOf(prefs.sidebar.read(null)).toEqualTypeOf<boolean>();

// Next.js cookie stores are valid sources and sinks.
declare const nextCookies: Awaited<ReturnType<typeof cookies>>;
readPrefs(prefs, nextCookies);
nextCookies.set(prefs.locale.toCookie('de'));
expectTypeOf(prefs.locale.toCookie('de')).toEqualTypeOf<CookieInit>();

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

// Next.js server API.
expectTypeOf(getPrefs(prefs)).resolves.toEqualTypeOf<PrefValues<typeof prefs>>();
expectTypeOf(NextPrefsProvider<typeof prefs>)
  .parameter(0)
  .toHaveProperty('mode')
  .toEqualTypeOf<'script' | 'server' | undefined>();

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
