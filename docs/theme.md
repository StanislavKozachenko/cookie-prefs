# Theme preset and migration from next-themes

`prefkit/theme`: an API-compatible replacement for next-themes that stores the choice in a cookie. Back to the [README](../README.md).

## Migration

```diff
- import { ThemeProvider, useTheme } from 'next-themes'
+ import { ThemeProvider, useTheme } from 'prefkit/theme'
```

```tsx
// app/layout.tsx
import { ThemeProvider } from 'prefkit/theme'

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
import { useTheme } from 'prefkit/theme'

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
- No server theme helper and no `theme-color` meta management (see [non-goals](security.md#non-goals)).

See also [security and platform notes](security.md) for the nonce, Trusted Types and the Safari cap.
