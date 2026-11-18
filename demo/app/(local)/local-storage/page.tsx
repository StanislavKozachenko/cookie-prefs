import { connection } from 'next/server';
import { LocalState } from '../../../components/local-state';
import { LocalTable } from '../../../components/local-table';
import { Shell } from '../../../components/shell';
import { DEFAULTS, serverRender } from '../../../lib/options';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LocalStoragePage({ searchParams }: { searchParams: SearchParams }) {
  // Rendered per request like the cookie page, so the comparison is fair; the server
  // just has nothing to go on but the defaults.
  await connection();
  const { embed } = await searchParams;
  return (
    <LocalState>
      <Shell embed={embed == '1'} server={serverRender(DEFAULTS)}>
        <LocalTable />
      </Shell>
    </LocalState>
  );
}
