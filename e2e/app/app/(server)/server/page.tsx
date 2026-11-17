import { PrefsPanel } from '../../prefs-components/PrefsPanel';
import { ServerValues } from '../../prefs-components/ServerValues';

export default function Page() {
  return (
    <main>
      <h1>Server mode</h1>
      <ServerValues />
      <PrefsPanel />
    </main>
  );
}
