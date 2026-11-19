import { getTheme } from 'cookie-prefs/theme/next';
import { ThemePanel } from '../../(theme)/theme/ThemePanel';

export default async function Page() {
  const theme = await getTheme();
  return (
    <main className={`theme-${theme}`} data-testid="wrapper">
      <h1>Theme read on the server</h1>
      <p>server theme: <span data-testid="server-theme">{theme}</span></p>
      <ThemePanel />
    </main>
  );
}
