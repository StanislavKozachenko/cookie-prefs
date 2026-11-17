import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { definePrefs, pref } from '../../index';
import type { StandardSchemaV1 } from '../standard-schema';

// Reads go through a plain map, so these tests exercise only the parsers.
const one = <T, V>(builder: { readonly '~types'?: { value: T; output: V } }) => {
  const { p } = definePrefs({ p: builder as never });
  return (raw: string | undefined) => p.read({ p: raw }) as V;
};

describe('pref.enum', () => {
  const read = one(pref.enum(['light', 'dark', 'system']).default('system'));

  it('reads a listed value', () => {
    expect(read('dark')).toBe('dark');
  });

  it('reads anything else as the default', () => {
    expect(read('blue')).toBe('system');
    expect(read('')).toBe('system');
    expect(read('DARK')).toBe('system');
    expect(read(' dark')).toBe('system');
    expect(read(undefined)).toBe('system');
    expect(read('toString')).toBe('system');
  });

  it('exposes the values and is undefined without a default', () => {
    const builder = pref.enum(['a', 'b']);
    expect(builder.values).toEqual(['a', 'b']);
    expect(one(builder)('c')).toBeUndefined();
  });
});

describe('pref.boolean', () => {
  const read = one(pref.boolean().default(true));

  it('reads true and false', () => {
    expect(read('true')).toBe(true);
    expect(read('false')).toBe(false);
  });

  it('reads anything else as the default', () => {
    for (const raw of ['', '1', '0', 'yes', 'TRUE', 'False', undefined]) expect(read(raw)).toBe(true);
  });
});

describe('pref.number', () => {
  const read = one(pref.number().default(25));

  it('reads finite numbers', () => {
    expect(read('50')).toBe(50);
    expect(read('-1.5')).toBe(-1.5);
    expect(read('0')).toBe(0);
    expect(read('1e3')).toBe(1000);
  });

  it('reads NaN, Infinity, empty and partial numbers as the default', () => {
    for (const raw of ['', ' ', 'NaN', 'Infinity', '-Infinity', 'abc', '12px', '0x10', '1,5'])
      expect(read(raw)).toBe(25);
  });

  it('is undefined without a default', () => {
    expect(one(pref.number())('nope')).toBeUndefined();
  });
});

describe('pref.string', () => {
  const read = one(pref.string());

  it('reads any string, including empty', () => {
    expect(read('de')).toBe('de');
    expect(read('')).toBe('');
    expect(read(undefined)).toBeUndefined();
  });

  it('uses the default when missing', () => {
    expect(one(pref.string().default('en'))(undefined)).toBe('en');
  });
});

describe('pref.json', () => {
  const read = one(pref.json(z.array(z.string())).default([]));

  it('reads JSON that passes the schema', () => {
    expect(read('["a","b"]')).toEqual(['a', 'b']);
  });

  it('reads tampered JSON or a rejected value as the default', () => {
    expect(read('["a",')).toEqual([]);
    expect(read('{"a":1}')).toEqual([]);
    expect(read('[1,2]')).toEqual([]);
    expect(read('')).toEqual([]);
    expect(read('null')).toEqual([]);
  });

  it('uses the schema output, not the raw JSON', () => {
    const trimmed = one(pref.json(z.object({ q: z.string().trim() })));
    expect(trimmed('{"q":"  x  ","extra":1}')).toEqual({ q: 'x' });
  });

  it('reads an async schema as the default', () => {
    const async: StandardSchemaV1<string[]> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => Promise.resolve({ value: value as string[] }),
      },
    };
    expect(one(pref.json(async).default(['d']))('["a"]')).toEqual(['d']);
  });

  it('reads a throwing schema as the default', () => {
    const throwing: StandardSchemaV1<string> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => {
          throw new Error('boom');
        },
      },
    };
    expect(one(pref.json(throwing).default('d'))('"a"')).toBe('d');
  });
});

describe('pref.custom', () => {
  const date = pref.custom({
    parse: (raw) => {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? undefined : d;
    },
    serialize: (d: Date) => d.toISOString(),
  });

  it('reads through the codec', () => {
    expect(one(date)('2026-01-02T00:00:00.000Z')).toEqual(new Date('2026-01-02T00:00:00.000Z'));
  });

  it('reads undefined or a throwing parse as the default', () => {
    expect(one(date)('nope')).toBeUndefined();
    const throwing = pref
      .custom<number>({
        parse: () => {
          throw new Error('boom');
        },
        serialize: String,
      })
      .default(7);
    expect(one(throwing)('1')).toBe(7);
  });

  it('keeps `this` of the codec', () => {
    class Codec {
      factor = 2;
      parse(raw: string) {
        return Number(raw) * this.factor;
      }
      serialize(value: number) {
        return String(value / this.factor);
      }
    }
    const { n } = definePrefs({ n: pref.custom(new Codec()) });
    expect(n.read({ n: '4' })).toBe(8);
    expect(n.toCookie(8).value).toBe('4');
  });
});

describe('builders', () => {
  it('are immutable', () => {
    const base = pref.enum(['a', 'b']);
    const withDefault = base.default('a');
    const withOptions = withDefault.options({ name: 'x' });
    expect(withDefault).not.toBe(base);
    expect(withOptions).not.toBe(withDefault);
    const prefs = definePrefs({ base, withDefault, withOptions });
    expect(prefs.base.defaultValue).toBeUndefined();
    expect(prefs.withDefault.defaultValue).toBe('a');
    expect(prefs.withDefault.name).toBe('withDefault');
    expect(prefs.withOptions.name).toBe('x');
  });

  it('applies .default() in any position of the chain', () => {
    const { a, b } = definePrefs({
      a: pref.number().reflect('--a').options({ maxAge: 1 }).default(3),
      b: pref.number().default(3).reflect('--b').options({ maxAge: 1 }),
    });
    expect(a.defaultValue).toBe(3);
    expect(b.defaultValue).toBe(3);
  });

  it('merges repeated .options() calls', () => {
    const { a } = definePrefs({ a: pref.string().options({ maxAge: 1 }).options({ path: '/x' }) });
    expect(a.toCookie('v')).toMatchObject({ maxAge: 1, path: '/x' });
  });

  it('serializes values for toCookie', () => {
    const prefs = definePrefs({
      e: pref.enum(['a', 'b']),
      b: pref.boolean(),
      n: pref.number(),
      s: pref.string(),
      j: pref.json(z.array(z.number())),
    });
    expect(prefs.e.toCookie('b').value).toBe('b');
    expect(prefs.b.toCookie(false).value).toBe('false');
    expect(prefs.n.toCookie(1.5).value).toBe('1.5');
    expect(prefs.s.toCookie('a b;c').value).toBe('a b;c');
    expect(prefs.j.toCookie([1, 2]).value).toBe('[1,2]');
  });
});
