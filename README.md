# prefkit

[![CI](https://github.com/StanislavKozachenko/prefkit/actions/workflows/ci.yml/badge.svg)](https://github.com/StanislavKozachenko/prefkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Typed, cookie-backed user preferences for React and Next.js: theme, sidebar, density, locale, anything small. nuqs keeps state in the URL; prefkit keeps it in cookies, so the server knows it before the first render.

- Readable in Server Components and on the client, with no hydration flash.
- Reflected on `<html>` before first paint (class, `data-*` attribute or CSS variable), so CSS can react to a preference without JavaScript.
- Synced across tabs.
- Typed end to end; invalid or missing cookies read as the default and never throw.
- The core has zero dependencies and fits a 2 kB gzip budget. `react` and `next` are optional peer dependencies.
- `prefkit/theme` is an API-compatible replacement for [next-themes](https://github.com/pacocoursey/next-themes) (its last release, 0.4.6, was in March 2025) that stores the choice in a cookie.

## Install

```sh
npm install prefkit
```

Peer dependencies, both optional: `react >=18` (for `prefkit/react`, `prefkit/next`, `prefkit/theme`) and `next >=14` (for `prefkit/next`).

## Quick start (Next.js App Router)

Define the prefs once in a plain module that both server and client code import:

```ts
// app/prefs.ts
import { definePrefs, pref } from 'prefkit'

export const prefs = definePrefs({
  theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class'),
  sidebar: pref.boolean().default(true).reflect('data-sidebar'),
  pageSize: pref.number().default(25),
  locale: pref.string(), // string | undefined
})
```

Add the provider to the root layout, at the top of `<body>`, and `suppressHydrationWarning` on `<html>` (the inline script changes its attributes before React hydrates):

```tsx
// app/layout.tsx
import { PrefsProvider } from 'prefkit/next'
import { prefs } from './prefs'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <PrefsProvider prefs={prefs}>{children}</PrefsProvider>
      </body>
    </html>
  )
}
```

Use a pref in a Client Component like `useState`:

```tsx
'use client'
import { usePref } from 'prefkit/react'
import { prefs } from './prefs'

export function SidebarToggle() {
  const [sidebar, setSidebar] = usePref(prefs.sidebar)
  return <button onClick={() => setSidebar((open) => !open)}>{sidebar ? 'Hide' : 'Show'}</button>
}
```

Read it in a Server Component (this makes the route dynamic):

```tsx
import { getPrefs } from 'prefkit/next'
import { prefs } from './prefs'

export default async function Page() {
  const { sidebar, pageSize } = await getPrefs(prefs) // typed: boolean, number
  return <Shell collapsed={!sidebar} pageSize={pageSize} />
}
```

Write it on the server with `toCookie`, for example in a Server Action:

```ts
'use server'
import { cookies } from 'next/headers'
import { prefs } from './prefs'

export async function setLocale(locale: string) {
  const store = await cookies()
  store.set(prefs.locale.toCookie(locale))
}
```

## The entries

| Import          | What it is                                                                                  | Guide |
| --------------- | ------------------------------------------------------------------------------------------- | ----- |
| `prefkit`       | Core, no DOM required: `definePrefs`, `pref.*`, `readPrefs`, `snapshotPrefs`, `prefsScript` | [Core](docs/core.md) |
| `prefkit/react` | `usePref`, and `PrefsProvider` for SSR outside Next.js                                      | [Core](docs/core.md#prefkitreact-outside-nextjs) |
| `prefkit/next`  | Server-only: `PrefsProvider`, `getPrefs` (App Router)                                       | [Next.js](docs/nextjs.md) |
| `prefkit/theme` | next-themes compatible `ThemeProvider` and `useTheme`                                       | [Theme](docs/theme.md) |

## Next.js modes

`PrefsProvider` runs in `script` mode by default (the route stays static, hooks render defaults until hydration) or `mode="server"` (the route becomes dynamic, hooks render the exact cookie values). Cache Components, `router.refresh()` and nonce are covered in the [Next.js guide](docs/nextjs.md).

## Reflection

`.reflect('class' | 'data-*' | '--name')` mirrors a pref on `<html>` before first paint, so CSS reacts to it without JavaScript. See [Reflection](docs/reflection.md), including the warning about reflecting free-form strings.

## Migrating from next-themes

```diff
- import { ThemeProvider, useTheme } from 'next-themes'
+ import { ThemeProvider, useTheme } from 'prefkit/theme'
```

Props and hook fields keep their next-themes names and defaults; the choice lives in a cookie, and existing `localStorage` themes are moved once. Setup and the full list of differences are in the [Theme guide](docs/theme.md).

## Security and platform notes

Prefs are readable by every script on the page: never store secrets. The pre-paint script needs a CSP nonce under strict policies, and Safari caps script-written cookies at 7 days (prefkit refreshes them). Details, Trusted Types, iframes and non-goals are in [Security and platform notes](docs/security.md).

## Compatibility

- React 18 and 19.
- Next.js 14 and newer, App Router. For the Pages Router use `prefkit/react` with `snapshotPrefs`. `>=14` is the supported range; the project's end-to-end tests do not cover every Next.js major.
- CI runs lint, type checks, build and tests on Node.js 22 and 24, on Linux, Windows and macOS. The package declares no `engines`.
- ESM and CJS builds with types for every entry.

## More

Guides: [Core and React](docs/core.md), [Next.js](docs/nextjs.md), [Reflection](docs/reflection.md), [Theme](docs/theme.md), [Security and non-goals](docs/security.md). Design decisions, verified facts and limitations: [docs/design.md](docs/design.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). License: [MIT](LICENSE).
