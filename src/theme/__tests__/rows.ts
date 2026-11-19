import type { ThemeProviderProps } from '../index';

// The provider options and cookie / storage states that the theme script and the client
// must agree on. Shared by the theme parity test (`script.test.tsx`) and the theme-color
// parity test (`../color/__tests__/parity.test.tsx`), so both cover the same combinations.

/** `<html>` as the user sees it. */
export interface HtmlState {
  className: string;
  attrs: Record<string, string>;
  colorScheme: string;
}

export const hostile = '</script><script>alert(1)</script>';

export interface Row {
  props?: ThemeProviderProps;
  cookie?: string;
  storage?: string | 'throws';
  dark?: boolean;
  expected: Partial<HtmlState>;
}

export const rows: Record<string, Row> = {
  'defaults, no cookie, light OS': {
    expected: { attrs: { 'data-theme': 'light', style: 'color-scheme: light;' } },
  },
  'defaults, no cookie, dark OS': {
    dark: true,
    expected: { attrs: { 'data-theme': 'dark', style: 'color-scheme: dark;' } },
  },
  'stored theme': { cookie: 'theme=dark', expected: { attrs: { 'data-theme': 'dark', style: 'color-scheme: dark;' } } },
  'stored system': { cookie: 'theme=system', dark: true, expected: { colorScheme: 'dark' } },
  'invalid cookie reads as default': { cookie: 'theme=blue', props: { defaultTheme: 'dark' }, expected: { colorScheme: 'dark' } },
  'malformed cookie reads as default': { cookie: 'theme=%E0%A4%A', props: { defaultTheme: 'dark' }, expected: { colorScheme: 'dark' } },
  'quoted cookie': { cookie: 'theme="dark"', expected: { colorScheme: 'dark' } },
  'prototype keys are not themes': { cookie: 'theme=__proto__', props: { defaultTheme: 'dark' }, expected: { colorScheme: 'dark' } },
  // A JSON object literal with an own `__proto__` key sets the prototype: the script
  // must parse its config, like the client gets it.
  ...Object.fromEntries(
    ['__proto__', 'constructor', 'toString'].flatMap((name): [string, Row][] => [
      [
        `theme named ${name}`,
        {
          props: { themes: [name, 'dark'], defaultTheme: 'dark', enableSystem: false },
          cookie: 'theme=' + name,
          expected: { attrs: { 'data-theme': name, style: 'color-scheme: dark;' } },
        },
      ],
      [
        `value key named ${name}`,
        {
          // from JSON, as a literal `{ __proto__: … }` would set the prototype here too
          props: { value: JSON.parse(`{"${name}":"own","dark":"d"}`) as Record<string, string>, attribute: 'class' },
          cookie: 'theme=' + name,
          expected: { className: 'own', colorScheme: '' },
        },
      ],
    ]),
  ),
  'class, enableSystem off, light default': {
    props: { attribute: 'class', enableSystem: false },
    cookie: 'theme=system',
    dark: true,
    expected: { className: 'light', colorScheme: 'light' },
  },
  'class attribute with a stored theme': {
    props: { attribute: 'class' },
    cookie: 'theme=dark',
    expected: { className: 'dark' },
  },
  'array attribute with value map': {
    props: { attribute: ['class', 'data-mode'], value: { dark: 'is-dark', light: 'is-light' } },
    cookie: 'theme=dark',
    expected: { className: 'is-dark', attrs: { class: 'is-dark', 'data-mode': 'is-dark', style: 'color-scheme: dark;' } },
  },
  'value key outside themes (README example)': {
    props: { value: { pink: 'my-pink-theme' } },
    cookie: 'theme=pink',
    expected: { attrs: { 'data-theme': 'my-pink-theme' }, colorScheme: '' },
  },
  'custom themes, color-scheme falls back to a light/dark default': {
    props: { themes: ['light', 'dark', 'sepia'], defaultTheme: 'dark' },
    cookie: 'theme=sepia',
    expected: { attrs: { 'data-theme': 'sepia', style: 'color-scheme: dark;' } },
  },
  'enableColorScheme off': {
    props: { enableColorScheme: false },
    cookie: 'theme=dark',
    expected: { attrs: { 'data-theme': 'dark' } },
  },
  'forced theme wins over the cookie': {
    props: { forcedTheme: 'dark', attribute: 'class' },
    cookie: 'theme=light',
    expected: { className: 'dark' },
  },
  'forced system is resolved': {
    props: { forcedTheme: 'system' },
    dark: true,
    expected: { attrs: { 'data-theme': 'dark', style: 'color-scheme: dark;' } },
  },
  'encoded storage key and theme names': {
    props: { storageKey: 'my theme', themes: ['high contrast', 'dark'], defaultTheme: 'dark', attribute: 'data-look' },
    cookie: 'my%20theme=high%20contrast',
    expected: { attrs: { 'data-look': 'high contrast', style: 'color-scheme: dark;' } },
  },
  'hostile theme names': {
    props: { themes: [hostile, 'a&b\u2028'], defaultTheme: hostile },
    cookie: 'theme=' + encodeURIComponent('a&b\u2028'),
    expected: { attrs: { 'data-theme': 'a&b\u2028' } },
  },
  'next-themes value in localStorage, no cookie': {
    storage: 'dark',
    expected: { attrs: { 'data-theme': 'dark', style: 'color-scheme: dark;' } },
  },
  'invalid localStorage value': {
    storage: 'blue',
    props: { defaultTheme: 'dark' },
    expected: { colorScheme: 'dark' },
  },
  'cookie wins over localStorage': {
    storage: 'light',
    cookie: 'theme=dark',
    expected: { colorScheme: 'dark' },
  },
  'localStorage throws': {
    storage: 'throws',
    props: { defaultTheme: 'dark' },
    expected: { colorScheme: 'dark' },
  },
};
