import { definePrefs, pref } from 'cookie-prefs';

// The theme is handled by ThemeProvider (storageKey "ctheme"), so no pref here reflects `class`.
export const cspPrefs = definePrefs({
  sidebar: pref.boolean().default(true).reflect('data-sidebar'),
  density: pref.enum(['compact', 'cozy']).default('cozy').reflect('data-density'),
});
