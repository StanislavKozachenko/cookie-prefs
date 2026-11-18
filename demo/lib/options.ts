// The preference values both pages offer. Plain data: the localStorage page uses it
// without cookie-prefs, `app/prefs.ts` builds the cookie prefs from it.

export const THEMES = ['light', 'dark', 'system'] as const;
export const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export const PAGE_SIZES = [5, 10, 20] as const;
export const LOCALES = ['en', 'de', 'ja'] as const;

export type Theme = (typeof THEMES)[number];
export type Density = (typeof DENSITIES)[number];
export type Locale = (typeof LOCALES)[number];

export interface DemoPrefs {
  theme: Theme;
  sidebar: boolean;
  density: Density;
  pageSize: number;
  locale: Locale;
}

export type PrefKey = keyof DemoPrefs;

export const PREF_KEYS = ['theme', 'sidebar', 'density', 'pageSize', 'locale'] as const satisfies readonly PrefKey[];

export const DEFAULTS: DemoPrefs = {
  theme: 'system',
  sidebar: true,
  density: 'comfortable',
  pageSize: 10,
  locale: 'en',
};

/** Non-default values the compare page writes into both stores. */
export const SAMPLE: DemoPrefs = {
  theme: 'dark',
  sidebar: false,
  density: 'compact',
  pageSize: 20,
  locale: 'de',
};

/** BCP 47 tag used for `Intl` and the table's `lang`. */
export const LOCALE_TAGS: Record<Locale, string> = { en: 'en-US', de: 'de-DE', ja: 'ja-JP' };

export const LOCALE_LABELS: Record<Locale, string> = { en: 'English', de: 'Deutsch', ja: '日本語' };

export const REPO_URL = 'https://github.com/StanislavKozachenko/cookie-prefs';
export const NPM_URL = 'https://www.npmjs.com/package/cookie-prefs';

/** Information about the server render, shown in the inspector. */
export interface ServerRender {
  /** What the server rendered with: the cookie values, or the defaults. */
  values: DemoPrefs;
  /** `HH:MM:SS.mmm` in UTC. */
  renderedAt: string;
  requestId: string;
}

export const serverRender = (values: DemoPrefs): ServerRender => ({
  values,
  renderedAt: new Date().toISOString().slice(11, 23),
  requestId: crypto.randomUUID().slice(0, 8),
});
