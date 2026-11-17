import type { CookieOptions } from 'prefkit';
import { expectTypeOf } from 'vitest';
import type { ThemeProviderProps } from '../index';

// `cookie`: the core's cookie attributes, the one prop next-themes does not have.
expectTypeOf<ThemeProviderProps['cookie']>().toEqualTypeOf<CookieOptions | undefined>();
const props: ThemeProviderProps = {
  storageKey: 'theme',
  cookie: { domain: 'example.com', sameSite: 'none', secure: true, partitioned: true, path: '/', maxAge: 60 },
};
expectTypeOf(props).toExtend<ThemeProviderProps>();
// @ts-expect-error `name` is the storageKey prop, not a cookie option
const named: ThemeProviderProps = { cookie: { name: 'x' } };
// @ts-expect-error only the core's SameSite values
const loose: ThemeProviderProps = { cookie: { sameSite: 'None' } };
void named;
void loose;
