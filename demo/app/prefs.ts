import { definePrefs, pref } from 'cookie-prefs';
import { DEFAULTS, DENSITIES, LOCALES, THEMES } from '../lib/options';

// Defined once, imported by Server and Client Components. Each pref is its own cookie,
// named after its key: `theme`, `sidebar`, `density`, `pageSize`, `locale`.
export const prefs = definePrefs({
  // CSS reacts to these three through `<html>` before first paint.
  theme: pref.enum(THEMES).default(DEFAULTS.theme).reflect('class'),
  sidebar: pref.boolean().default(DEFAULTS.sidebar).reflect('data-sidebar'),
  density: pref.enum(DENSITIES).default(DEFAULTS.density).reflect('data-density'),
  // The server renders the table with these two.
  pageSize: pref.number().default(DEFAULTS.pageSize),
  locale: pref.enum(LOCALES).default(DEFAULTS.locale),
});
