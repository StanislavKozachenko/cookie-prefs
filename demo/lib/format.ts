import { DEFAULTS, LOCALE_TAGS, type Locale } from './options';

/** `Intl` formatters for one locale. UTC and a 24-hour clock keep server and client output identical. */
export const formatters = (locale: Locale) => {
  const tag = LOCALE_TAGS[locale];
  return {
    date: new Intl.DateTimeFormat(tag, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    }),
    integer: new Intl.NumberFormat(tag),
    compact: new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 }),
    currency: new Intl.NumberFormat(tag, { style: 'currency', currency: 'USD' }),
    seconds: new Intl.NumberFormat(tag, { style: 'unit', unit: 'second', unitDisplay: 'narrow' }),
  };
};

/**
 * A row count that is safe to slice with. `pref.number()` accepts any finite number,
 * so a hand-edited cookie can hold 0 or -3: those render the default page size.
 */
export const rowCount = (pageSize: number, total: number) =>
  Math.min(total, pageSize >= 1 ? Math.trunc(pageSize) : DEFAULTS.pageSize);

/**
 * `name=value` pairs of these cookies, as `document.cookie` holds them (still
 * URI-encoded), in the given order. The first of duplicate names wins, like the browser.
 */
export const pickCookies = (cookie: string, names: readonly string[]): string => {
  const found = new Map<string, string>();
  for (const part of cookie.split(/; */)) {
    const eq = part.indexOf('=');
    const name = eq < 0 ? '' : part.slice(0, eq).trim();
    if (names.includes(name) && !found.has(name)) found.set(name, part.slice(eq + 1).trim());
  }
  return names.flatMap((name) => (found.has(name) ? [name + '=' + found.get(name)] : [])).join('; ');
};
