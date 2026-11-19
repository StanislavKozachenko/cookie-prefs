import { describe, expect, it, vi } from 'vitest';

// An app can load the core twice (ESM + CJS through a CommonJS library, or two
// versions in node_modules). Handles from one copy must work with the other.
const load = async () => {
  vi.resetModules();
  return import('../../index');
};

describe('two copies of the core', () => {
  it('reads handles created by the other copy', async () => {
    const a = await load();
    const b = await load();
    expect(b).not.toBe(a);
    expect(b.readPrefs).not.toBe(a.readPrefs);

    const prefs = a.definePrefs(
      {
        theme: a.pref.enum(['light', 'dark', 'system']).default('system').reflect('class', { dark: 'is-dark' }),
        sidebar: a.pref.boolean().default(true).reflect('data-sidebar'),
        pageSize: a.pref.number().default(25).reflect('--page-size'),
        locale: a.pref.string(),
      },
      { prefix: 'app.' },
    );
    const header = 'app.theme=dark; app.sidebar=false; app.locale=de; other=1';

    expect(b.readPrefs(prefs, header)).toEqual(a.readPrefs(prefs, header));
    expect(b.snapshotPrefs(prefs, header)).toEqual(a.snapshotPrefs(prefs, header));
  });

  it('keeps the shared config off enumerable keys', async () => {
    const { definePrefs, pref } = await load();
    const { theme } = definePrefs({ theme: pref.enum(['a', 'b']).reflect('class') });
    expect(Object.getOwnPropertySymbols(theme)).toHaveLength(1);
    expect(Object.getOwnPropertySymbols({ ...theme })).toEqual([]);
  });
});
