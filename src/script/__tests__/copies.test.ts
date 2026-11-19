import { describe, expect, it, vi } from 'vitest';

// An app can load the core and this entry more than once (ESM + CJS through a CommonJS
// library, or two versions in node_modules). The script reads the reflection config from
// the handle, so it works with handles from any copy of the core.
const load = async () => {
  vi.resetModules();
  return { core: await import('../../index'), script: await import('../index') };
};

const define = ({ definePrefs, pref }: Awaited<ReturnType<typeof load>>['core']) =>
  definePrefs(
    {
      theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class', { dark: 'is-dark' }),
      sidebar: pref.boolean().default(true).reflect('data-sidebar'),
      pageSize: pref.number().default(25).reflect('--page-size'),
      locale: pref.string(),
    },
    { prefix: 'app.' },
  );

describe('copies of the core and the script entry', () => {
  it('builds the same script from handles of either copy of the core', async () => {
    const a = await load();
    const b = await load();
    expect(b.core).not.toBe(a.core);
    expect(b.script.prefsScript).not.toBe(a.script.prefsScript);

    const fromA = define(a.core);
    const fromB = define(b.core);
    const source = a.script.prefsScript(fromA);
    expect(source).not.toBe('');
    expect(a.script.prefsScript(fromB)).toBe(source);
    expect(b.script.prefsScript(fromA)).toBe(source);
    expect(b.script.prefsScript({ ...fromA, ...fromB })).toBe(source);
  });
});
