import { headers } from 'next/headers';
import { getPrefs } from 'cookie-prefs/next';
import { CookieState } from '../../components/cookie-state';
import { DataTable } from '../../components/data-table';
import { Shell } from '../../components/shell';
import { pickCookies } from '../../lib/format';
import { PREF_KEYS, serverRender } from '../../lib/options';
import { prefs } from '../prefs';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CookiePage({ searchParams }: { searchParams: SearchParams }) {
  // Typed values from the request's cookies; invalid or missing ones read as the default.
  const values = await getPrefs(prefs);
  const { embed } = await searchParams;
  // The raw cookies, so the inspector's first HTML shows what the browser sent.
  const cookies = pickCookies(
    (await headers()).get('cookie') ?? '',
    PREF_KEYS.map((key) => prefs[key].name),
  );

  return (
    <CookieState serverCookies={cookies}>
      <Shell embed={embed == '1'} server={serverRender(values)}>
        {/* A Server Component: the first response already has the right rows and formats. */}
        <DataTable pageSize={values.pageSize} locale={values.locale} />
      </Shell>
    </CookieState>
  );
}
