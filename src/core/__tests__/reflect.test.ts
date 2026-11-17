import { parse } from 'acorn';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { definePrefs, pref, prefsScript, type PrefsRecord } from '../../index';

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
  vi.unstubAllEnvs();
});

/** Run the generated script the way a browser runs an inline script. */
const run = (prefs: PrefsRecord) => new Function(prefsScript(prefs))();

const state = () => ({
  class: html.className,
  attrs: Object.fromEntries([...html.attributes].map((a) => [a.name, a.value])),
});

const make = () =>
  definePrefs(
    {
      theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class', { dark: 'is-dark' }),
      density: pref.enum(['compact', 'cozy']).default('cozy').reflect(['data-density', '--density'], { compact: 'c' }),
      sidebar: pref.boolean().default(true).reflect('data-sidebar'),
      pageSize: pref.number().default(25).reflect('--page-size'),
      locale: pref.string().reflect('data-locale'),
      plain: pref.string().default('x'),
      columns: pref.json(z.array(z.string())).default([]),
    },
    { prefix: 'app.' },
  );

const hostile = '</script><script>alert(1)</script>';

const makeHostile = () =>
  definePrefs({
    x: pref
      .enum([hostile, 'b'])
      .default(hostile)
      .reflect('data-x', { b: '<!-- &    -->' }),
  });

describe('prefsScript', () => {
  it('returns an empty string when no pref reflects', () => {
    expect(prefsScript(definePrefs({ a: pref.string(), b: pref.number().default(1) }))).toBe('');
    expect(prefsScript({})).toBe('');
  });

  it('applies defaults when there are no cookies', () => {
    run(make());
    expect(html.className).toBe('system');
    expect(html.getAttribute('data-density')).toBe('cozy');
    expect(html.style.getPropertyValue('--density')).toBe('cozy');
    expect(html.getAttribute('data-sidebar')).toBe('true');
    expect(html.style.getPropertyValue('--page-size')).toBe('25');
    expect(html.hasAttribute('data-locale')).toBe(false);
  });

  it('applies cookie values with value maps and swaps enum classes', () => {
    html.className = 'keep light';
    html.setAttribute('data-locale', 'stale');
    document.cookie = 'app.theme=dark';
    document.cookie = 'app.density=compact';
    document.cookie = 'app.sidebar=false';
    document.cookie = 'app.pageSize=50';
    document.cookie = 'app.locale=de%20AT';
    run(make());
    expect(html.className).toBe('keep is-dark');
    expect(html.getAttribute('data-density')).toBe('c');
    expect(html.style.getPropertyValue('--density')).toBe('c');
    expect(html.getAttribute('data-sidebar')).toBe('false');
    expect(html.style.getPropertyValue('--page-size')).toBe('50');
    expect(html.getAttribute('data-locale')).toBe('de AT');
  });

  it('removes the attribute of a missing pref without a default', () => {
    html.setAttribute('data-locale', 'stale');
    run(make());
    expect(html.hasAttribute('data-locale')).toBe(false);
  });

  it('reads invalid and malformed cookies as the default', () => {
    document.cookie = 'app.theme=blue';
    document.cookie = 'app.density=hasOwnProperty';
    document.cookie = 'app.sidebar=yes';
    document.cookie = 'app.pageSize=NaN';
    document.cookie = 'app.locale=%E0%A4%A';
    run(make());
    expect(html.className).toBe('system');
    expect(html.getAttribute('data-density')).toBe('cozy');
    expect(html.getAttribute('data-sidebar')).toBe('true');
    expect(html.style.getPropertyValue('--page-size')).toBe('25');
    expect(html.hasAttribute('data-locale')).toBe(false);
  });

  it('matches what the client applies for the same cookies', () => {
    const cases = [
      [],
      ['app.theme=light', 'app.pageSize=1e3', 'app.locale=', 'app.sidebar=false'],
      ['app.theme=dark', 'app.density=compact', 'app.pageSize=-0.5', 'app.locale=%22q%22'],
      ['app.theme=nope', 'app.pageSize=12px', 'app.locale=a%3Bb'],
    ];
    for (const cookies of cases) {
      clearCookies();
      resetHtml();
      for (const c of cookies) document.cookie = c;
      const prefs = make();
      run(prefs);
      const fromScript = state();
      resetHtml();
      const offs = Object.values(prefs).map((p) => p.subscribe(() => {}));
      offs.forEach((off) => off());
      expect(state()).toEqual(fromScript);
    }
  });

  it('reads an enum value named __proto__ like the client', () => {
    const prefs = definePrefs({
      x: pref.enum(['a', '__proto__']).default('a').reflect(['data-x', 'class'], { ['__proto__']: 'proto' }),
    });
    for (const cookie of ['x=__proto__', 'x=a', 'x=constructor']) {
      document.cookie = cookie;
      resetHtml();
      run(prefs);
      const fromScript = state();
      resetHtml();
      prefs.x.subscribe(() => {})();
      expect(state(), cookie).toEqual(fromScript);
    }
    document.cookie = 'x=__proto__';
    run(prefs);
    expect(state()).toEqual({ class: 'proto', attrs: { class: 'proto', 'data-x': 'proto' } });
  });

  type Reflectable = { reflect(target: string): ReturnType<typeof pref.string> };

  it('stops a pref at an invalid name or class like the client', () => {
    vi.stubEnv('NODE_ENV', 'production'); // the dev-only class check would throw first
    const prefs = definePrefs({
      a: pref.enum(['x', 'y']).default('x').reflect(['data-before', 'data-bad name', 'data-after']),
      c: pref.enum(['x', 'y']).default('y').reflect(['data-c', 'class', 'data-c2'], { x: '' }),
      b: pref.boolean().default(true).reflect('data-b'),
      // JavaScript callers can reflect any pref to a class; the types allow enums only
      d: (pref.custom({ parse: (raw) => raw, serialize: String }) as unknown as Reflectable).reflect('class'),
    });
    vi.unstubAllEnvs();
    for (const cookies of [[], ['a=y', 'c=x', 'd=zz'], ['c=y', 'b=false']]) {
      clearCookies();
      for (const c of cookies) document.cookie = c;
      resetHtml();
      run(prefs);
      const fromScript = state();
      resetHtml();
      for (const p of Object.values(prefs)) p.subscribe(() => {})();
      expect(state(), cookies.join('; ')).toEqual(fromScript);
    }
    expect(state().attrs).toEqual({ 'data-before': 'x', 'data-c': 'y', 'data-b': 'false' });
  });

  it('strips quotes around the value, like rawOf', () => {
    document.cookie = 'app.locale="fr"';
    run(make());
    expect(html.getAttribute('data-locale')).toBe('fr');
  });

  it('honours the name option', () => {
    const prefs = definePrefs({ t: pref.enum(['a', 'b']).options({ name: 'tt' }).reflect('data-t') });
    document.cookie = 'tt=b';
    run(prefs);
    expect(html.getAttribute('data-t')).toBe('b');
  });

  it('never throws, and one bad pref does not stop the others', () => {
    vi.stubEnv('NODE_ENV', 'production'); // the dev-only class check would throw first
    const prefs = definePrefs({
      bad: pref.enum(['a b', 'c']).default('a b').reflect('class'),
      good: pref.boolean().default(true).reflect('data-good'),
    });
    expect(() => run(prefs)).not.toThrow();
    expect(html.getAttribute('data-good')).toBe('true');
  });

  it('parses as ES5 for every config', () => {
    // It runs before any transpiled code, so it must be ES5 as a whole, config included.
    const configs: PrefsRecord[] = [
      {},
      definePrefs({ a: pref.string(), b: pref.number().default(1) }),
      make(),
      makeHostile(),
      definePrefs({ t: pref.enum(['a', 'b']).options({ name: 'tt' }).reflect('data-t') }),
    ];
    for (const prefs of configs)
      expect(() => parse(prefsScript(prefs), { ecmaVersion: 5, sourceType: 'script' })).not.toThrow();
  });

  it('is fixed code plus JSON config in a string literal', () => {
    const src = prefsScript(make());
    expect(src).toMatch(/^\(function\(P\)\{.*\}catch\(e\)\{\}\}\)\("\[.*\]"\)$/);
    expect(src).not.toContain('function ' + 'anonymous');
    const config = JSON.parse(JSON.parse(src.slice(src.indexOf('})("') + 3, -1))) as unknown[];
    expect(config).toHaveLength(5);
    expect(config[0]).toEqual(['app.theme', ['class'], { light: 'light', dark: 'is-dark', system: 'system' }, 'system']);
  });

  it('escapes hostile values so the script is safe to inline in HTML', () => {
    const prefs = makeHostile();
    const src = prefsScript(prefs);
    expect(src).not.toMatch(/[<>\u2028\u2029]/);
    expect(src.indexOf('})("')).toBeGreaterThan(0);
    expect(src.slice(src.indexOf('})("'))).not.toContain('&');
    expect(src).toContain('\\u003c/script\\u003e');

    run(prefs);
    expect(html.getAttribute('data-x')).toBe(hostile);
    document.cookie = 'x=b';
    run(prefs);
    expect(html.getAttribute('data-x')).toBe('<!-- & \u2028\u2029 -->');
  });
});
