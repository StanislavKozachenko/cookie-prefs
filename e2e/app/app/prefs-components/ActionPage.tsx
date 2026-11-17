import { setLocale } from '../actions';
import { PrefsPanel } from './PrefsPanel';
import { ServerValues } from './ServerValues';

export function ActionPage({ path }: { path: string }) {
  return (
    <main>
      <h1>Server Action</h1>
      <form action={setLocale.bind(null, path)}>
        <input type="hidden" name="value" value="de" />
        <button type="submit" data-testid="action-set-locale">set locale de (action)</button>
      </form>
      <ServerValues />
      <PrefsPanel />
    </main>
  );
}
