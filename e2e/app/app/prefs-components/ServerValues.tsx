import { getPrefs } from 'cookie-prefs/next';
import { prefs } from '../prefs';
import { fmt } from '../lib/fmt';

export async function ServerValues() {
  const v = await getPrefs(prefs);
  return (
    <section>
      <h2>Server Component (getPrefs)</h2>
      <p>theme: <span data-testid="rsc-theme">{fmt(v.theme)}</span></p>
      <p>sidebar: <span data-testid="rsc-sidebar">{fmt(v.sidebar)}</span></p>
      <p>density: <span data-testid="rsc-density">{fmt(v.density)}</span></p>
      <p>pageSize: <span data-testid="rsc-pageSize">{fmt(v.pageSize)}</span></p>
      <p>locale: <span data-testid="rsc-locale">{fmt(v.locale)}</span></p>
      <p>columns: <span data-testid="rsc-columns">{fmt(v.columns)}</span></p>
    </section>
  );
}
