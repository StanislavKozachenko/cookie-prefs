import type { ReactNode } from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from 'react-router';
import { snapshotPrefs } from 'cookie-prefs';
import { PrefsProvider } from 'cookie-prefs/react';
import { prefsScript } from 'cookie-prefs/script';
import type { Route } from './+types/root';
import { prefs } from './prefs';

// The raw pref cookies of the request. Loader data is serialized into the page, so the
// client hydrates with the very snapshot the server rendered with.
export function loader({ request }: Route.LoaderArgs) {
  return { snapshot: snapshotPrefs(prefs, request.headers.get('cookie')) };
}

// `Layout` renders the document for the route and for the error boundary, so it reads the
// root loader data with `useRouteLoaderData` (undefined when the loader threw).
export function Layout({ children }: { children: ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root');
  return (
    // The pre-paint script changes <html> attributes before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <PrefsProvider snapshot={data?.snapshot} script={prefsScript(prefs)}>
          {children}
        </PrefsProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
