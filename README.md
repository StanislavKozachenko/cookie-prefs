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
  ;(await cookies()).set(prefs.locale.toCookie(locale))
}
```

A cookie written earlier in the same request (in a Server Action or in middleware) is visible to `getPrefs` and to `mode="server"` in that same response.

## The entries

| Import          | What it is                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------- |
| `prefkit`       | Core, no DOM required: `definePrefs`, `pref.*`, `readPrefs`, `snapshotPrefs`, `prefsScript`  |
| `prefkit/react` | `usePref`, and `PrefsProvider` for SSR outside Next.js                                       |
| `prefkit/next`  | Server-only: `PrefsProvider`, `getPrefs` (App Router)                                        |
| `prefkit/theme` | next-themes compatible `ThemeProvider` and `useTheme`                                        |

### `prefkit`

Builders: `pref.enum([...])`, `pref.boolean()`, `pref.number()`, `pref.string()`, `pref.json(schema)` and `pref.custom({ parse, serialize })`. Each takes `.default(value)` (removes `undefined` from the read type) and `.options({ name, path, maxAge, ... })`; enum, boolean, number and string also take `.reflect(...)`.

`pref.json` requires a synchronous [Standard Schema](https://standardschema.dev) validator (zod, valibot, arktype), because cookies are user-controlled input. Writes take the schema's input type, reads return its output. For anything else use `pref.custom`.

```ts
import { definePrefs, pref, readPrefs } from 'prefkit'
import * as z from 'zod'

export const prefs = definePrefs(
  {
    density: pref.enum(['compact', 'cozy']).default('cozy'),
    columns: pref.json(z.array(z.string())).default([]),
  },
  { prefix: 'app.' }, // cookie names become `app.density`, `app.columns`
)

// In the browser, outside React too
prefs.density.get()                         // 'cozy', read from document.cookie
prefs.density.set('compact')                // writes the cookie, notifies subscribers and other tabs
prefs.density.set((d) => (d == 'cozy' ? 'compact' : 'cozy'))
prefs.density.reset()                       // deletes the cookie, back to the default
const stop = prefs.density.subscribe((density) => {}) // returns an unsubscribe function

// On any server (request handler, middleware, Remix loader, Astro)
const values = readPrefs(prefs, request.headers.get('cookie')) // { density, columns }, typed
prefs.density.read(request.cookies)         // one pref; accepts a header string, a cookie store or a map
response.cookies.set(prefs.density.toCookie('compact'))
```

Clearing is `reset()`, never `set(undefined)`. `set()` and `reset()` do nothing on the server and `get()` returns the default there: use `read()` or `getPrefs()` instead.

`toCookie()` returns the cookie as `{ name, value, path, maxAge, sameSite, ... }`, which Next.js `cookies().set()` accepts. Its `value` is not URI-encoded: frameworks encode on set, but if you write a raw `Set-Cookie` header yourself, pass the value through `encodeURIComponent`.

### `prefkit/react`

`usePref(pref)` returns `[value, setValue]`. Every component using the same pref stays in sync, also across tabs.

Outside Next.js (Vite, Remix, TanStack Start), wrap the app once so the server render sees the request's cookies and the pre-paint script is emitted:

```tsx
import { prefsScript, snapshotPrefs } from 'prefkit'
import { PrefsProvider } from 'prefkit/react'

<PrefsProvider snapshot={snapshotPrefs(prefs, cookieHeader)} script={prefsScript(prefs)} nonce={nonce}>
  <App />
</PrefsProvider>
```

`snapshot` holds only the raw cookies of your prefs and is serializable. Omit it for a static page: hooks then render defaults until hydration ends. Place the provider at the top of `<body>`. In the Pages Router, compute the snapshot in `getServerSideProps` and pass it to the provider in `_app`.

### `prefkit/next`

`PrefsProvider` (an async Server Component) and `getPrefs`, shown above. Both read the request's raw `Cookie` header and parse it the way the browser parses `document.cookie` (the first of duplicate cookies wins, quotes are stripped), so the server never disagrees with what the inline script already put on `<html>`. A pref cookie set or deleted earlier in the same request is taken from `cookies()` instead, which is how a Server Action write shows up in its own response.

## Next.js modes

`PrefsProvider` takes a `mode`:

| `mode`               | Route           | Hooks during SSR and hydration |
| -------------------- | --------------- | ------------------------------ |
| `"script"` (default) | stays static    | render the defaults            |
| `"server"`           | becomes dynamic | render the exact cookie values |

In `script` mode the inline script has already put the right attributes on `<html>`, so anything visible before hydration must come from those attributes and CSS (see Reflection), not from the value a hook returns. After hydration hooks switch to the cookie value. Use `mode="server"` when the app is dynamic anyway and you want exact server-rendered output:

```tsx
<PrefsProvider prefs={prefs} mode="server">{children}</PrefsProvider>
```

With Cache Components, `mode="server"` needs `export const instant = false` in the layout, and `getPrefs` must be called inside `<Suspense>`.

Client writes do not re-render Server Components. When server output depends on a pref, refresh after writing:

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { usePref } from 'prefkit/react'
import { prefs } from './prefs'

export function DensityToggle() {
  const router = useRouter()
  const [density, setDensity] = usePref(prefs.density)
  return (
    <button
      onClick={() => {
        setDensity(density == 'cozy' ? 'compact' : 'cozy')
        router.refresh()
      }}
    >
      {density}
    </button>
  )
}
```

Pass a CSP nonce with `<PrefsProvider prefs={prefs} nonce={nonce}>`, for example from `(await headers()).get('x-nonce')`.

## Reflection

`.reflect(target)` mirrors a pref on `<html>` before first paint and after every change. A target is:

- `'class'` (enums only): adds the current value as a class and removes the others
- `'data-*'`: sets an attribute
- `'--name'`: sets a CSS custom property

`.reflect` also takes a list of targets, and enums can map values to different DOM strings with a second argument: `.reflect('data-density', { compact: 'tight' })`.

```ts
density: pref.enum(['compact', 'cozy']).default('cozy').reflect('data-density'),
sidebar: pref.boolean().default(true).reflect('data-sidebar'),
```

```css
[data-density='compact'] .card { padding: 0.5rem; }
[data-sidebar='false'] .sidebar { display: none; }
```

Reflected free-form strings and numbers are written into the DOM exactly as the cookie holds them, and cookies can be set by the user or by sibling subdomains. Reflect a `pref.string()` only if you would accept an attacker-chosen value in that attribute or CSS variable (no `url()` in the variable, no selectors that leak it). Prefer an enum.

## Theme and migration from next-themes

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

The props (`themes`, `forcedTheme`, `enableSystem`, `disableTransitionOnChange`, `enableColorScheme`, `storageKey`, `defaultTheme`, `attribute`, `value`, `nonce`, `scriptProps`) and the `useTheme` fields (`theme`, `setTheme`, `resolvedTheme`, `systemTheme`, `themes`, `forcedTheme`) keep their next-themes names and defaults. The one new prop is `cookie`, the cookie attributes of the theme (the same options as `.options()` above):

```tsx
// one theme for all subdomains
<ThemeProvider cookie={{ domain: 'example.com' }}>
// inside a cross-site iframe
<ThemeProvider cookie={{ sameSite: 'none', secure: true, partitioned: true }}>
```

The theme is stored in a cookie named `storageKey` (default `theme`), so the server can read it. The provider does not server-render the theme itself: the inline script applies it before paint and the route stays static.

### Differences from next-themes

- The choice is stored in a cookie, not in `localStorage`.
- Existing users keep their theme: when there is no cookie yet and `localStorage[storageKey]` holds a valid theme, it is moved to the cookie once and then removed from `localStorage`. Rolling back to next-themes therefore starts from its default instead of keeping the choice.
- Invalid stored values and invalid `setTheme` names fall back to or keep a valid theme; next-themes applies any string.
- `value` is applied the same way by the script and by the client; next-themes' script ignores it for `data-*` attributes.
- A forced `'system'` is resolved by the script too, and `color-scheme` is set the same way before and after hydration.
- `theme`, `resolvedTheme` and `systemTheme` are `undefined` during SSR and hydration and resolve right after. next-themes returns the `localStorage` value during hydration and so needs a mounted guard to avoid a mismatch.
- Only `class` and `data-*` attributes are supported (enforced by the types).
- Other tabs are followed through the core (CookieStore, or BroadcastChannel) instead of the `storage` event.
- The inline script is fixed source rather than a stringified function, and renders without the React 19 script warning.
- No server theme helper and no `theme-color` meta management (see Non-goals).

## Security and platform notes

- **No secrets.** Prefs are written by the browser, so they are never `HttpOnly` and are readable by every script on the page. Never store secrets or session data in a pref. Cookie values are user input: invalid ones read as the default.
- **Cookie defaults.** `Path=/`, `SameSite=Lax`, `Max-Age` of 400 days (the cap browsers enforce; every write refreshes it), no `Domain`, and `Secure` added automatically on `https:` pages for browser writes. `toCookie()` omits `Secure` unless you set it. Change them for all prefs in `definePrefs(shape, options)` or per pref with `.options()`. `prefix: '__Host-'` opts into a cookie prefix and also needs `secure: true` and no `domain`.
- **CSP and nonce.** The pre-paint script is an inline script: pass `nonce` to `PrefsProvider` (or `ThemeProvider`) when your policy requires one. The client re-applies reflections with plain DOM calls and never runs a script, so it needs no nonce. `disableTransitionOnChange` adds a `<style>` that carries the same nonce.
- **Trusted Types.** If your policy enforces `require-trusted-types-for 'script'`, a provider that is first mounted on the client (not hydrated from server HTML) sets the inert script's text through React, which the policy rejects.
- **Safari 7-day cap.** Safari caps cookies written through `document.cookie` at 7 days. To keep a pref from reverting a week after its last write, `usePref` and `ThemeProvider` re-write an existing cookie once per page load, with the same value, so the window counts from the last visit. A pref that no hook uses is refreshed only by `set()`. A cookie set by the server with `Set-Cookie` (for example in middleware, with `toCookie()`) is not capped. This is based on WebKit's documentation and on CI, not on tests on real Safari or iOS devices.
- **One React context.** Two copies of `prefkit/react` in one app mean two React contexts, so a provider from one copy does not reach hooks from the other. Keep a single installed version.
- **Sandboxed iframes.** Without `allow-same-origin`, the browser blocks cookie access: `get()` returns the default and `set()` does nothing, without throwing.

## Compatibility

- React 18 and 19.
- Next.js 14 and newer, App Router. For the Pages Router use `prefkit/react` with `snapshotPrefs`. `>=14` is the supported range; the project's end-to-end tests do not cover every Next.js major.
- CI runs lint, type checks, build and tests on Node.js 22 and 24, on Linux, Windows and macOS. The package declares no `engines`.
- ESM and CJS builds with types for every entry.

## Non-goals

- A server-side theme helper (`getTheme`) and server rendering of the theme preset; `theme-color` management and a forced theme per page without a provider.
- Automatic `router.refresh()` after writes, and optimistic server sync.
- Async validators, value migrations or versioning, encryption or signing.
- `localStorage`, `sessionStorage` or a combined-cookie backend, and URL state (use nuqs).
- Reflection targets other than `<html>`, and system-preference resolution for prefs other than the theme.
- Batch hooks, selectors, devtools and middleware helpers.

The design decisions, verified facts and limitations are in [docs/design.md](docs/design.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
