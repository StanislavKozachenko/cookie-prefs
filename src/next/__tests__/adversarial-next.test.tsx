import {
  createRequestStore,
  synchronizeMutableCookies,
} from 'next/dist/server/async-storage/request-store';
import { cookies, headers } from 'next/headers.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definePrefs, pref, readPrefs, snapshotPrefs, type PrefsSnapshot } from '../../index';
import { getPrefs, PrefsProvider } from '../index';

// Attacks on the hybrid read of `cookie-prefs/next`: it parses the raw `Cookie` header
// like the browser and takes a `cookies()` value only when it is a write made earlier
// in this request. Any header on which its copy of Next's parser disagrees with the
// real one would show up as a phantom write.

vi.mock('next/headers.js', () => ({ cookies: vi.fn(), headers: vi.fn() }));

/** Next's real request store for this header; `action` runs as a Server Action first. */
const request = async (cookie: string | null, action?: () => Promise<void>, middleware?: string) => {
  const store = createRequestStore({
    phase: action ? 'action' : 'render',
    headers: {
      ...(cookie == null ? {} : { cookie }),
      ...(middleware && { 'x-middleware-set-cookie': middleware }),
    },
    url: { pathname: '/' },
  } as never);
  vi.mocked(headers).mockImplementation(async () => store.headers);
  vi.mocked(cookies).mockImplementation(
    async () => (store.phase == 'action' ? store.userspaceMutableCookies : store.cookies) as never,
  );
  if (action) {
    await action();
    store.phase = 'render';
    synchronizeMutableCookies(store);
  }
};

afterEach(() => {
  vi.mocked(cookies).mockReset();
  vi.mocked(headers).mockReset();
});

const make = () =>
  definePrefs({
    theme: pref.enum(['light', 'dark', 'system', 'true']).default('system'),
    sidebar: pref.boolean().default(true),
    locale: pref.string(),
    the: pref.string().default('-'),
    size: pref.number().default(1).options({ name: 'my size' }),
  });

const serverSnapshot = async (prefs: ReturnType<typeof make>) =>
  ((await PrefsProvider({ prefs, mode: 'server' })).props as { snapshot: PrefsSnapshot }).snapshot;

const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('without same-request writes, the server reads exactly the header', () => {
  const names = ['theme', 'sidebar', 'locale', 'the', 'my%20size', 'xtheme', 'theme2', 'Theme', 'my size', ' theme', 'theme ', ''];
  const values = [
    'dark',
    'light',
    'true',
    'false',
    '"dark"',
    '%22dark%22',
    '""',
    '"',
    '',
    '=',
    'a=b',
    '%',
    '%E0%A4%A',
    '%2520',
    'de%20AT',
    'de+AT',
    ' dark',
    'dark ',
    '1e3',
    '12',
    '__proto__',
    '\t',
  ];
  const separators = ['; ', ';', ';  ', ' ; ', ';\t'];

  it('for generated headers: getPrefs and the server-mode snapshot match readPrefs and snapshotPrefs', async () => {
    const next = random(0x4e);
    const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
    const prefs = make();
    for (let i = 0; i < 300; i++) {
      let header = '';
      for (let n = Math.floor(next() * 8); n-- > 0; ) {
        const r = next();
        // a bare name, an empty pair, or name=value
        const part = r < 0.1 ? pick(names) : r < 0.15 ? '' : `${pick(names)}=${pick(values)}`;
        header += (header || r < 0.2 ? pick(separators) : '') + part;
      }
      await request(header);
      const label = JSON.stringify(header);
      expect(await getPrefs(prefs), label).toEqual(readPrefs(prefs, header));
      expect(await serverSnapshot(prefs), label).toEqual(snapshotPrefs(prefs, header));
    }
  });

  it('bare names are not values on the server either, though Next reads them as true', async () => {
    const prefs = make();
    await request('theme; sidebar; locale; the');
    expect((await cookies()).get('sidebar')?.value).toBe('true');
    expect(await getPrefs(prefs)).toEqual({ theme: 'system', sidebar: true, locale: undefined, the: '-', size: 1 });
    await request('sidebar=false; sidebar');
    expect(await getPrefs(prefs)).toMatchObject({ sidebar: false });
  });

  it('a pref named like the start of other cookies only reads its own', async () => {
    const prefs = make();
    await request('theme2=dark; xtheme=dark; them=dark; themes=dark; the%6De=dark; theme-=dark');
    expect(await getPrefs(prefs)).toMatchObject({ theme: 'system', the: '-' });
    await request('the=x; theme=dark; there=y');
    expect(await getPrefs(prefs)).toMatchObject({ theme: 'dark', the: 'x' });
  });

  it('hundreds of duplicates: the first wins, as in the browser', async () => {
    const prefs = make();
    const header = ['locale=first', ...Array.from({ length: 500 }, (_, i) => `locale=v${i}`)].join('; ');
    await request(header);
    expect((await cookies()).get('locale')?.value).toBe('v499');
    expect(await getPrefs(prefs)).toMatchObject({ locale: 'first' });
  });
});

describe('same-request writes that differ from the header only by encoding or quotes', () => {
  const cases: [header: string, write: string, expected: string][] = [
    ['locale="de"', 'de', 'de'],
    ['locale=de', '"de"', '"de"'],
    ['locale=%22de%22', 'de', 'de'],
    ['locale=de%20AT', 'de+AT', 'de+AT'],
    ['locale=de+AT', 'de AT', 'de AT'],
    ['locale=%2520', '%20', '%20'],
    ['locale=%20', '%20', '%20'],
    ['locale=x', ' x ', ' x '],
    ['locale=%E0%A4%A', '%E0%A4%A', '%E0%A4%A'],
    ['locale', 'de', 'de'],
    ['locale=a; locale=b', 'a', 'a'],
  ];

  it.each(cases)('header %j, written %j', async (header, write, expected) => {
    const prefs = make();
    await request(header, async () => {
      (await cookies()).set(prefs.locale.toCookie(write));
    });
    expect((await getPrefs(prefs)).locale).toBe(expected);
    expect((await serverSnapshot(prefs)).locale).toBe(expected);
  });

  it('writes to a cookie whose name contains the pref’s do not touch it', async () => {
    const prefs = make();
    await request('theme=dark; the=x', async () => {
      (await cookies()).set('xtheme', 'light');
      (await cookies()).set('theme2', 'light');
      (await cookies()).set('thE', 'y');
      (await cookies()).delete('them');
    });
    expect(await getPrefs(prefs)).toMatchObject({ theme: 'dark', the: 'x' });
  });

  it('a write of an encoded pref name lands on that pref only', async () => {
    const prefs = make();
    await request('my%20size=5; my size=6', async () => {
      (await cookies()).set(prefs.size.toCookie(7));
    });
    expect(await getPrefs(prefs)).toMatchObject({ size: 7 });
  });
});
