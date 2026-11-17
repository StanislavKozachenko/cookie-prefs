import { definePrefs, pref } from 'cookie-prefs';
import * as z from 'zod';

export const prefs = definePrefs({
  theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class'),
  sidebar: pref.boolean().default(true).reflect('data-sidebar'),
  density: pref.enum(['compact', 'cozy']).default('cozy').reflect('data-density'),
  pageSize: pref.number().default(25),
  locale: pref.string(),
  columns: pref.json(z.array(z.string())).default([]),
});

// Used by the cookie-refresh test: a pref with a short Max-Age (1 hour) next to the default ones (400 days).
export const shortPrefs = definePrefs({
  recent: pref.string().options({ maxAge: 3600 }),
});
