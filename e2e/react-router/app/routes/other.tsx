import { Link } from 'react-router';
import { readPrefs } from 'cookie-prefs';
import type { Route } from './+types/other';
import { prefs } from '../prefs';
import { PrefsPanel, ServerValues } from '../components';

// Reached by a client-side navigation too: the loader then runs on the server for a
// data request, which carries the cookies the client wrote.
export function loader({ request }: Route.LoaderArgs) {
  return readPrefs(prefs, request.headers.get('cookie'));
}

export default function Other({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <h1>Other</h1>
      <ServerValues values={loaderData} />
      <PrefsPanel />
      <Link data-testid="to-home" to="/">home</Link>
    </main>
  );
}
