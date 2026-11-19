import { Link } from 'react-router';
import { readPrefs } from 'cookie-prefs';
import type { Route } from './+types/home';
import { prefs } from '../prefs';
import { PrefsPanel, ServerValues } from '../components';

export function loader({ request }: Route.LoaderArgs) {
  return readPrefs(prefs, request.headers.get('cookie'));
}

export function meta() {
  return [{ title: 'cookie-prefs on React Router' }];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <h1>Home</h1>
      <ServerValues values={loaderData} />
      <PrefsPanel />
      <Link data-testid="to-other" to="/other">other page</Link>
    </main>
  );
}
