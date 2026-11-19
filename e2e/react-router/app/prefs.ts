import { definePrefs, pref } from 'cookie-prefs';

// A plain module, imported by the loaders (server) and the components (server and client).
export const prefs = definePrefs({
  theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class'),
  sidebar: pref.boolean().default(true).reflect('data-sidebar'),
  density: pref.enum(['compact', 'cozy']).default('cozy').reflect('data-density'),
  pageSize: pref.number().default(25),
});
