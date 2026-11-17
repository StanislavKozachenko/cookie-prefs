import { afterEach, describe, expect, it } from 'vitest';
import * as z from 'zod';
import { definePrefs, pref, prefsScript, type PrefsRecord } from '../index';
import { reapply } from './reapply';

const html = document.documentElement;

const clearCookies = () => {
  for (const pair of document.cookie.split('; '))
    if (pair) document.cookie = `${pair.split('=')[0]}=; Max-Age=0; Path=/`;
};

const resetHtml = () => {
  for (const { name } of [...html.attributes]) html.removeAttribute(name);
};

afterEach(() => {
  clearCookies();
  resetHtml();
});

/** `className`, every attribute and the inline style of `<html>`. */
const state = () => ({
  className: html.className,
  attrs: Object.fromEntries([...html.attributes].map((a) => [a.name, a.value])),
  style: html.style.cssText,
});

/** Run the inline script the way a browser runs it. */
const runScript = (prefs: PrefsRecord) => new Function(prefsScript(prefs))();

const hostile = '</script>"})([\' &;=';

const configs: Record<string, () => PrefsRecord> = {
  plain: () =>
    definePrefs({
      theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class'),
      sidebar: pref.boolean().default(true).reflect('data-sidebar'),
      pageSize: pref.number().default(25).reflect('--page-size'),
      locale: pref.string().reflect('data-locale'),
      mode: pref.enum(['a', 'b']).reflect(['class', 'data-mode']),
      columns: pref.json(z.array(z.string())).default([]),
    }),
  'value maps, class + data + css var, prefix': () =>
    definePrefs(
      {
        theme: pref
          .enum(['light', 'dark', 'system'])
          .default('system')
          .reflect(['class', 'data-theme', '--theme'], { dark: 'is-dark', light: 'is-light' }),
        density: pref.enum(['compact', 'cozy']).default('cozy').reflect(['data-density', '--density'], { compact: 'c' }),
        size: pref.number().reflect(['data-size', '--size']),
        label: pref.string().default('none').reflect(['data-label', '--label']),
      },
      { prefix: 'app.' },
    ),
  'name override and encoded names': () =>
    definePrefs(
      {
        t: pref.enum(['a', 'b']).options({ name: 'my t' }).reflect('data-t'),
        'odd key;=': pref.boolean().default(false).reflect('data-odd'),
        u: pref.string().reflect('data-u'),
      },
      { prefix: 'p é/' },
    ),
  'hostile strings': () =>
    definePrefs({
      x: pref
        .enum([hostile, 'b', '__proto__'])
        .default(hostile)
        .reflect(['class', 'data-x', '--x'], { b: '<!-- &   -->', ['__proto__']: 'proto' }),
      y: pref.string().default(hostile).reflect(['data-y', '--y']),
    }),
  // Unmasked: no hostile class aborts the pref before `__proto__` is looked up.
  '__proto__ enum values': () =>
    definePrefs({
      p: pref.enum(['a', '__proto__']).default('a').reflect(['data-p', '--p']),
      q: pref
        .enum(['__proto__', 'b'])
        .default('__proto__')
        .reflect(['data-q', 'class'], { ['__proto__']: 'proto' }),
    }),
  'one bad pref': () =>
    definePrefs({
      bad: pref.enum(['a b', 'c']).default('a b').reflect(['data-bad-before', 'class', 'data-bad-after']),
      good: pref.boolean().default(true).reflect('data-good'),
      bad2: pref.enum(['ok', 'x y']).reflect(['class', 'data-bad2']),
      last: pref.number().default(1).reflect('--last'),
    }),
};

/** Cookie states, as raw `document.cookie` writes of encoded names. */
const cookieStates = (prefs: PrefsRecord) => {
  const names = Object.values(prefs).map((p) => p.name);
  const all = (value: string) => names.map((n) => `${n}=${value}`);
  return [
    [],
    ...[
      'light',
      'dark',
      'compact',
      'b',
      'a',
      'ok',
      'x%20y',
      'c',
      'true',
      'false',
      '50',
      '-0.5',
      '1e3',
      '%22fr%22',
      '"fr"',
      '"dark"',
      '"50"',
      '',
      encodeURIComponent(hostile),
      '__proto__',
      'hasOwnProperty',
      'constructor',
      'toString',
      'blue',
      'NaN',
      'Infinity',
      '12px',
      '0x10',
      ' 5',
      '%E0%A4%A',
      'de%20AT',
      'a%3Bb',
    ].map(all),
    // mixed: some valid, some tampered, some missing
    names.map((n, i) => `${n}=${['dark', 'nope', '7', '%E0%A4%A'][i % 4]}`),
    names.filter((_, i) => i % 2).map((n) => `${n}=false`),
  ];
};

/** What a previous page state or another pref left on `<html>`. */
const dirty = () => {
  html.className = 'keep light is-dark is-light c proto b ok';
  for (const a of ['data-sidebar', 'data-locale', 'data-mode', 'data-t', 'data-x', 'data-good', 'data-bad2'])
    html.setAttribute(a, 'stale');
  html.style.setProperty('--page-size', '9');
  html.style.setProperty('--theme', 'stale');
  html.style.setProperty('--x', 'stale');
};

describe('reapply', () => {
  for (const [label, make] of Object.entries(configs))
    it(`matches the inline script: ${label}`, () => {
      const prefs = make();
      let checked = 0;
      for (const cookies of cookieStates(prefs))
        for (const start of [resetHtml, dirty]) {
          clearCookies();
          for (const c of cookies) document.cookie = c;
          resetHtml();
          start();
          runScript(prefs);
          const fromScript = state();
          resetHtml();
          start();
          reapply(prefsScript(prefs));
          expect(state(), `${label} | ${cookies.join('; ')} | ${start.name}`).toEqual(fromScript);
          checked++;
        }
      expect(checked).toBeGreaterThan(50);
    });

  it('applies values, maps, prefixes and names (not a no-op)', () => {
    document.cookie = 'app.theme=dark';
    document.cookie = 'app.density=compact';
    document.cookie = 'app.size=1e3';
    html.className = 'keep is-light';
    reapply(prefsScript(configs['value maps, class + data + css var, prefix']!()));
    expect(html.className).toBe('keep is-dark');
    expect(html.getAttribute('data-theme')).toBe('is-dark');
    expect(html.getAttribute('data-density')).toBe('c');
    expect(html.getAttribute('data-size')).toBe('1000');
    expect(html.getAttribute('data-label')).toBe('none');
    expect(html.style.getPropertyValue('--theme')).toBe('is-dark');
    expect(html.style.getPropertyValue('--size')).toBe('1000');

    const named = configs['name override and encoded names']!();
    document.cookie = `${encodeURIComponent('my t')}=b`;
    document.cookie = `${encodeURIComponent('p é/odd key;=')}=true`;
    reapply(prefsScript(named));
    expect(html.getAttribute('data-t')).toBe('b');
    expect(html.getAttribute('data-odd')).toBe('true');
  });

  it('removes what has no value and no default', () => {
    html.setAttribute('data-size', 'stale');
    html.style.setProperty('--size', 'stale');
    reapply(prefsScript(configs['value maps, class + data + css var, prefix']!()));
    expect(html.hasAttribute('data-size')).toBe(false);
    expect(html.style.getPropertyValue('--size')).toBe('');
  });

  it('never throws, whatever the string', () => {
    for (const s of [
      '',
      'x',
      '})(',
      '})("',
      '})("x")',
      '})("[1]")',
      '})("[null,[1],{\\"a\\":1}]")',
      '})("{\\"a\\":1}")',
      '})("[[1,null]]")',
      '})([[1,null]])',
    ])
      expect(() => reapply(s)).not.toThrow();
    expect(html.attributes).toHaveLength(0);
  });

  it('finds the config right after the fixed source, even with `})("` in values', () => {
    const plain = prefsScript(configs.plain!());
    const { z } = definePrefs({ z: pref.string().default('})("x")').reflect('data-z') });
    const src = prefsScript({ ...configs['hostile strings']!(), z });
    const end = src.indexOf('})("') + 3;
    // The fixed source is the same for every config and holds `})("` only at its end;
    // the string literal after it escapes every `"`.
    expect(src.slice(0, end)).toBe(plain.slice(0, plain.indexOf('})("') + 3));
    expect(src.slice(end)).toContain('})(');
    const config = JSON.parse(JSON.parse(src.slice(end, -1)));
    expect(config[0][3]).toBe(hostile);
    expect(config.at(-1)[3]).toBe('})("x")');
  });
});
