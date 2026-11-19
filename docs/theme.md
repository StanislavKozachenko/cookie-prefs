# Theme preset and migration from next-themes

`cookie-prefs/theme`: an API-compatible replacement for next-themes that stores the choice in a cookie. Back to the [README](../README.md).

## Migration

```diff
- import { ThemeProvider, useTheme } from 'next-themes'
+ import { ThemeProvider, useTheme } from 'cookie-prefs/theme'
```

```tsx
// app/layout.tsx
import { ThemeProvider } from 'cookie-prefs/theme'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

```tsx
'use client'
import { useTheme } from 'cookie-prefs/theme'

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return <button onClick={() => setTheme(resolvedTheme == 'dark' ? 'light' : 'dark')}>{theme}</button>
}
```

The props (`themes`, `forcedTheme`, `enableSystem`, `disableTransitionOnChange`, `enableColorScheme`, `storageKey`, `defaultTheme`, `attribute`, `value`, `nonce`, `scriptProps`) and the `useTheme` fields (`theme`, `setTheme`, `resolvedTheme`, `systemTheme`, `themes`, `forcedTheme`) keep their next-themes names and defaults. The one new prop is `cookie`, the cookie attributes of the theme (`path`, `domain`, `maxAge`, `sameSite`, `secure`, `partitioned`):

```tsx
// one theme for all subdomains
<ThemeProvider cookie={{ domain: 'example.com' }}>
// inside a cross-site iframe
<ThemeProvider cookie={{ sameSite: 'none', secure: true, partitioned: true }}>
```

The theme is stored in a cookie named `storageKey` (default `theme`), so the server can read it. The provider does not server-render the theme itself: the inline script applies it before paint and the route stays static.

## Reading the theme on the server

Opt-in, in entries of their own, so the client `cookie-prefs/theme` bundle and apps that do not import them are unchanged. Both return the stored theme exactly as `useTheme().theme` holds it after hydration for the same cookie and the same options: a name the provider does not list, or a malformed cookie, reads as `defaultTheme`.

```tsx
// app/layout.tsx (Next.js App Router)
import { ThemeProvider } from 'cookie-prefs/theme'
import { getTheme } from 'cookie-prefs/theme/next'

const themes = ['light', 'dark'] as const

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme({ themes }) // 'light' | 'dark' | 'system'
  return (
    <html lang="en" className={theme == 'system' ? undefined : theme} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" themes={[...themes]}>{children}</ThemeProvider>
      </body>
    </html>
  )
}
```

```ts
// any other server (React Router / Remix loader, a Request handler, Express)
import { readTheme } from 'cookie-prefs/theme/server'

const theme = readTheme(request.headers.get('cookie'), { themes: ['light', 'dark'] })
```

- Pass the options the provider gets (`themes`, `enableSystem`, `storageKey`, `defaultTheme`, `value`), or the same props object: other props are ignored. With `themes` as a literal list the result is typed as those names plus `'system'`.
- `'system'` is returned as is: only the browser knows the OS scheme, so render no class for it and let the inline script resolve it.
- `forcedTheme` is not applied; use `forcedTheme ?? theme` where a page forces one.
- Reading request cookies makes the route dynamic, so it does not fit static rendering or Cache Components (outside `<Suspense>` it blocks prerendering, and `<html>` cannot be wrapped in one). That is why the provider is script-only by default; use these only where the route is dynamic anyway.
- The inline script still runs and stays the source of truth before hydration, and `<html>` needs `suppressHydrationWarning` as before.
- `getTheme()` reads the request like `getPrefs` (the `Cookie` header as the browser sends it, plus a theme cookie written earlier in the same request by a Server Function or middleware). It is async and works on Next.js 14, 15 and 16. Server Components are not refreshed by `setTheme()`: call `router.refresh()` when server output depends on the theme.
- Right after a move from next-themes, the first request has no cookie yet (the value is still in `localStorage`), so the server sees the default until the client has moved it.

## Differences from next-themes

- The choice is stored in a cookie, not in `localStorage`.
- Existing users keep their theme: when there is no cookie yet and `localStorage[storageKey]` holds a valid theme, it is moved to the cookie once and then removed from `localStorage`. Rolling back to next-themes therefore starts from its default instead of keeping the choice.
- Invalid stored values and invalid `setTheme` names fall back to or keep a valid theme; next-themes applies any string.
- `value` is applied the same way by the script and by the client; next-themes' script ignores it for `data-*` attributes.
- A forced `'system'` is resolved by the script too, and `color-scheme` is set the same way before and after hydration.
- `theme`, `resolvedTheme` and `systemTheme` are `undefined` during SSR and hydration and resolve right after. next-themes returns the `localStorage` value during hydration and so needs a mounted guard to avoid a mismatch.
- Only `class` and `data-*` attributes are supported (enforced by the types).
- Other tabs are followed through the core (CookieStore, or BroadcastChannel) instead of the `storage` event.
- The inline script is fixed source rather than a stringified function, and renders without the React 19 script warning.
- The stored theme can be read on the server with `getTheme()` / `readTheme()` (see above); next-themes has no server helper. No `theme-color` meta management (see [non-goals](security.md#non-goals)).

See also [security and platform notes](security.md) for the nonce, Trusted Types and the Safari cap.
