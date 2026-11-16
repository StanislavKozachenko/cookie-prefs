# prefkit design

Contract for the implementation. The public types in `src/index.ts`, `src/types.ts`,
`src/react/index.tsx`, `src/next/index.tsx` and `src/theme/index.ts` are final;
`src/types.test-d.ts` pins their inference and is checked by `npm run typecheck`.
Change the API only together with this document.

> nuqs keeps state in the URL; prefkit keeps it in cookies, so the server knows it before the first render.

## Usage

### `prefkit` (core, no DOM required, zero dependencies)

```ts
// app/prefs.ts: a plain module, imported by server and client code
import { definePrefs, pref } from 'prefkit'
import * as z from 'zod' // any Standard Schema validator, optional

export const prefs = definePrefs({
  theme: pref.enum(['light', 'dark', 'system']).default('system').reflect('class'),
  sidebar: pref.boolean().default(true).reflect('data-sidebar'),
  density: pref.enum(['compact', 'cozy']).default('cozy').reflect('data-density'),
  pageSize: pref.number().default(25),
  locale: pref.string(), // string | undefined
  columns: pref.json(z.array(z.string())).default([]),
})

prefs.sidebar.get()                     // boolean, from document.cookie
prefs.sidebar.set((open) => !open)      // writes the cookie, syncs other tabs
prefs.theme.reset()                     // deletes the cookie -> 'system'
prefs.theme.subscribe((theme) => {})    // returns unsubscribe

// any server: Request handler, middleware, Remix loader, Astro
readPrefs(prefs, request.headers.get('cookie')) // { theme, sidebar, ... } typed
prefs.locale.read(request.cookies)              // one pref
response.cookies.set(prefs.locale.toCookie('de'))
```

### `prefkit/react`

```tsx
'use client'
import { usePref } from 'prefkit/react'

const [sidebar, setSidebar] = usePref(prefs.sidebar)
<button onClick={() => setSidebar((open) => !open)}>Toggle</button>

// non-Next SSR (Vite, Remix, TanStack Start): wrap the app once
<PrefsProvider snapshot={snapshotPrefs(prefs, cookieHeader)} script={prefsScript(prefs)}>
  <App />
</PrefsProvider>
```

### `prefkit/next` (App Router, server-only entry)

```tsx
// app/layout.tsx
import { PrefsProvider } from 'prefkit/next'
import { prefs } from './prefs'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* mode="script" (default): route stays static; mode="server": exact SSR from cookies() */}
        <PrefsProvider prefs={prefs}>{children}</PrefsProvider>
      </body>
    </html>
  )
}

// any Server Component (makes that route dynamic)
const { sidebar } = await getPrefs(prefs)
```

### `prefkit/theme` (next-themes compatible)

```tsx
- import { ThemeProvider, useTheme } from 'next-themes'
+ import { ThemeProvider, useTheme } from 'prefkit/theme'

<ThemeProvider attribute="class" defaultTheme="system" enableSystem>{children}</ThemeProvider>

const { theme, resolvedTheme, setTheme } = useTheme()
```

## Decisions

1. **One cookie per pref**, named `prefix + key` (`prefix` defaults to `''`; per-pref `.options({ name })` overrides). Independent writes from two tabs cannot clobber each other (no read-modify-write of a shared blob), each pref gets its own attributes, the 4 KB cookie limit applies per pref, and cookies stay readable in devtools, middleware and the inline script. Cost: a few bytes of header per extra pref.
2. **Cookie defaults**: `Path=/`, `SameSite=Lax`, `Max-Age` 400 days (the RFC 6265bis cap; every write refreshes it), no `Domain`, `Secure` added automatically on `https:` pages for browser writes and omitted by `toCookie()` unless set. Override for all prefs in `definePrefs(shape, options)` or per pref with `.options()`. Prefs are never `HttpOnly` because the browser writes them, so they are readable by any script: never store secrets or session data in a pref.
3. **Builder, then handle**. `pref.*` returns an immutable builder carrying a type-only `'~types'` marker (`PrefTypes<T, V>`); `definePrefs` turns each into a `Pref<T, V>` handle (codec + cookie name + store). `T` is the writable type, `V` is `T` with a default or `T | undefined` without. The handle is what `usePref` takes and works outside React. The setter takes `T | ((prev: V) => T)`; clearing is `reset()`, never `set(undefined)`.
4. **Server snapshot**: the provider carries `PrefsSnapshot`, the raw cookie strings of only these prefs (serializable across the RSC boundary, never other request cookies). `usePref` uses `useSyncExternalStore` with `getServerSnapshot = parse(snapshot[name])`, or the default when there is no snapshot (script mode), so SSR and hydration render the same value; afterwards it reads `document.cookie`. Values only the client can resolve (`'system'`) are never stored resolved: the cookie holds the choice, the resolved value is client-derived state that is `undefined` during SSR and hydration (`resolvedTheme`, `systemTheme`), and the DOM gets it from the inline script before paint.
5. **Script mode**: enum, boolean, number and string prefs declare `.reflect(target, valueMap?)`, where target is `'class'` (enums only), `data-*` or a `--css-var`, on `<html>`. `prefsScript(prefs)` returns fixed hand-written code plus a JSON config with `<` escaped (no `Function.prototype.toString`, which broke next-themes in #370). React renders it as `<script>` with `type="text/javascript"` on the server and `type="text/plain"` on the client plus `suppressHydrationWarning`, the fix from the Next.js docs: React does not warn for data-block scripts. `nonce` is a prop. The script also runs in server mode, because `<html>` attributes cannot depend on `cookies()` under Cache Components.
6. **Client writes** go straight to `document.cookie` (synchronous, works on plain-HTTP localhost, `get()` after `set()` is consistent); local subscribers are notified synchronously; other tabs learn via the CookieStore `change` event where available, else a `BroadcastChannel` message posted after each write. No Server Action round trip. Server Components that read prefs via `getPrefs` are not refreshed: when server output depends on a pref, the app calls `router.refresh()` after `set` (documented pattern, not automatic, so a sidebar toggle never refetches the page).
7. **Not in v1**: see "Non-goals".

Other decisions:

- `PrefsProvider` in `prefkit/next` defaults to `mode="script"`: dropping it into the root layout must not make the whole app dynamic or break Cache Components builds. `mode="server"` is opt-in for apps that are dynamic anyway.
- `pref.json` requires a Standard Schema: cookies are user-controlled input, so there is no unchecked `json<T>()`. Use `pref.custom()` as the escape hatch. Validation is synchronous; a schema returning a Promise reads as the default.
- Invalid or missing cookie means default, never throw; this includes `parse` throwing, JSON errors, out-of-list enum values and `NaN`.
- The theme preset stores in a cookie named `storageKey` (default `theme`), reads a next-themes value from `localStorage[storageKey]` once when the cookie is missing and moves it to the cookie, passes nested providers through like next-themes, and is script-mode only (no `cookies()` read).

## Verified facts (2026-11-16)

| Fact | Effect on the design | Source |
| --- | --- | --- |
| `cookies()` is async (since 15.0 RC); readable in Server Components; `.set`/`.delete` only in Server Functions and Route Handlers ("HTTP does not allow setting cookies after streaming starts") | `getPrefs` is async; server writes use `toCookie()` in a Server Function | https://nextjs.org/docs/app/api-reference/functions/cookies |
| Without Cache Components, `cookies()` in a layout makes the route dynamic; with Cache Components, outside `<Suspense>` it blocks prerendering | `mode="script"` default; `getPrefs` documented as dynamic | same, and https://nextjs.org/docs/messages/blocking-prerender-runtime |
| `<html data-theme>` cannot be wrapped in `<Suspense>`; Next docs say move the read to a pre-paint client script plus `suppressHydrationWarning` | `<html>` reflection is always done by the script, in both modes | https://nextjs.org/docs/messages/blocking-prerender-runtime |
| Next docs fix for the React dev warning on `<script>`: `type` `text/javascript` on server, `text/plain` on client, `suppressHydrationWarning` | used for the pre-paint script | https://nextjs.org/docs/app/guides/preventing-flash-before-hydration |
| React warns only when creating a script element on the client and skips data-block scripts (`isScriptDataBlock`) | confirms the fix above | https://github.com/facebook/react/blob/main/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js |
| In dev Strict Mode React resets `<html>` attributes on remount, clearing what the script set | the client re-applies reflections in `useLayoutEffect` on provider mount | https://nextjs.org/docs/app/guides/preventing-flash-before-hydration |
| `useServerInsertedHTML`: Client Component, App Router only, built for CSS-in-JS registries; callback runs every flush; docs prefer inline scripts in RSC; Next does not add a nonce; a script lands in `<body>` if something above suspended | not used: framework-specific and no gain over the `type` fix | https://nextjs.org/docs/app/api-reference/functions/use-server-inserted-html |
| CookieStore API: Baseline 2025 (Chrome/Edge 87, Firefox 140, Safari 18.4, about 95% global); secure contexts only | listening only, with BroadcastChannel fallback; writes use `document.cookie` | https://developer.mozilla.org/en-US/docs/Web/API/CookieStore, https://caniuse.com/cookie-store-api |
| BroadcastChannel: Baseline widely available since March 2022 | fallback channel | https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel |
| Cookie expiry: RFC 6265bis recommends a 400-day upper limit (Chrome enforces it) | default `maxAge` 400 days | https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html |
| `__Host-` cookies need `Secure`, `Path=/`, no `Domain` | documented on `prefix` | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie |
| Standard Schema v1: `'~standard'` with `version: 1`, `vendor`, `validate()` returning a result or a Promise, optional `types.{input,output}`; spec allows copying the interface | structural copy in `src/standard-schema.ts`; sync-only validation | https://standardschema.dev/ |
| next-themes 0.4.6 (published 2025-03-11) is the latest; props and `useTheme` fields as typed in `src/theme/index.ts`; defaults: `storageKey 'theme'`, `attribute 'data-theme'`, `themes ['light','dark']`, `enableSystem true`, `enableColorScheme true` | theme preset mirrors them | https://github.com/pacocoursey/next-themes, npm registry |
| next-themes top open issues: #385 and #387 React 19 script warning (no maintainer response), #375 stale theme with Cache Components / Activity (effect re-applies on reveal), #370 `__name is not defined` in the injected script, #78 `theme-color`, #226 and #187 forcing a theme per page in App Router | preset fixes #385/#387 (`type` fix), #375 (external store, no reveal effects), #370 (static script); #78 and #226 are non-goals | https://github.com/pacocoursey/next-themes/issues |
| nuqs: `parseAsX.withDefault()` removes `null`; setter takes value or updater; invalid value reads as default | same semantics, `.default()` naming | https://nuqs.dev/docs/basic-usage |
| `@wrksz/themes`: next-themes-shaped API, cookie storage, `getTheme()` server helper, script via `useServerInsertedHTML` | confirms the conventions; prefkit's difference is general typed prefs | https://github.com/jakubwarkusz/themes |

## Implementation notes

- **Entry boundaries.** `prefkit/react` and `prefkit/theme` are client modules: their built files start with `'use client'`, prepended to the ESM and CJS output in tsup `onSuccess` (tree shaking strips a `banner` directive, and one config avoids `clean` races between parallel builds). `prefkit/next` is server-only: no `'use client'`, it imports `next/headers`. Server helpers must never live in a client entry, because a Server Component calling them gets a client reference.
- **No duplicated state.** Runtime imports between entries use package specifiers (`'prefkit'`, `'prefkit/react'`) marked external in tsup, not relative paths, so the cross-tab listener and stores exist once and the client boundary survives bundling. Type-only imports from `../types` are fine.
- **Duplicate copies.** Handles are portable across copies of the core (ESM + CJS, two versions): what `prefsScript` needs lives on the handle under a `Symbol.for` key, not in module state; two copies of `prefkit/react` still mean two React contexts, which is inherent to React.
- **Next `PrefsProvider`** is an async Server Component: in `'server'` mode it awaits `cookies()` and passes `snapshotPrefs(prefs, store)`; in both modes it passes `prefsScript(prefs)` and `nonce` to the client `PrefsProvider` from `'prefkit/react'`. `prefs` itself never crosses to the client.
- **Snapshots must be stable** for `useSyncExternalStore`: cache the parsed value per pref by raw string, so `json` and `custom` prefs do not return a new object on every read.
- **Own-write echo.** The CookieStore `change` event also fires for this tab's writes; compare raw values before notifying.
- **Encoding.** Names and values are `encodeURIComponent`-encoded; booleans are `'true'`/`'false'`; enums and numbers are stored as is; `json` is `JSON.stringify` then encoded.
- **Encoding at the edges.** `Pref.name` is the encoded cookie name (the key in `document.cookie`, the `Cookie` header and `PrefsSnapshot`). Snapshots and cookie stores/maps passed as `CookieSource` hold URI-decoded values; only a header string is decoded by prefkit. `toCookie().value` is not URI-encoded: frameworks encode on set, code writing a raw `Set-Cookie` header must call `encodeURIComponent`.
- **Nonce.** Browsers hide `nonce` after load, so render it on the server only or keep `suppressHydrationWarning` on the script. The React `PrefsProvider` renders `type` and `nonce` from `typeof document` at render time (server: `text/javascript` + nonce; client: `text/plain`, no nonce) with `suppressHydrationWarning`; hydration never patches attributes, so the server element keeps its nonce.
- **Re-applying reflection.** The client provider runs the `script` string again in a layout effect on mount (dev Strict Mode / remounts can reset `<html>`) and on `visibilitychange` to visible, so prefs nobody in this tab subscribes to follow other tabs when the tab is shown again (subscribed prefs follow at once through the store). Nothing is executed: `prefkit/react` reads the JSON config back from the `script` string (the fixed source ends in `})(` and holds `})([` nowhere else, so the first `})([` marks the start of the JSON, which runs to the final `)`) and applies it from `document.cookie` with `classList`, `setAttribute` and `style`. That code is a step-by-step port of the inline script (cookie lookup, decoding, validation, default, class swap, removal, per-pref `try`); a parity test runs both over a table of configs and cookies, so keep them in sync. With no script element, `eval` or script text assignment, CSP and enforced Trusted Types (`require-trusted-types-for 'script'`) have nothing to check, and the client needs no nonce; it stays on the server-rendered script. No core export was needed.
- **Nested providers** merge their snapshots (inner keys win); a provider without a snapshot keeps the outer one.
- **Script mode trade-off.** Hooks render defaults until hydration ends; anything visible before hydration must come from reflected attributes plus CSS. Document this next to `mode`.
- **`get()` on the server** returns the default; add a dev-only warning pointing to `read()` / `getPrefs()`.
- **Size budget.** All of core (parsers, cookie codec, store, sync, Standard Schema glue, reflection, `prefsScript` source) must fit 2 KB gzip. If it cannot, discuss moving `prefsScript` before touching the limit.
- **Tooling.** `tsconfig.json` uses `"jsx": "react-jsx"`; its `paths` and the vitest `resolve.alias` map `prefkit` and `prefkit/react` to `src/`, so typecheck and tests run from source while tsup keeps them external.
- **Sizes.** `size-limit` checks `prefkit/react` and `prefkit/next` too, with peers and core excluded.

## Non-goals for v1

- Server-side theme helper (`getTheme`) and SSR of the theme preset; the cookie is plain `storageKey` and readable with `cookies()`.
- `theme-color` meta management (next-themes #78) and per-page forced theme without a provider (#226).
- Automatic `router.refresh()` after writes, Server Action writes, optimistic server sync.
- Pages Router integration (use `prefkit/react` with `snapshotPrefs` in `getServerSideProps`).
- Async Standard Schema validation, migrations or versioning of stored values, encryption or signing.
- Combined cookies, `localStorage` or `sessionStorage` backends, URL state (use nuqs).
- Reflection targets other than `<html>`, and system-preference resolution for generic prefs (the theme preset owns it).
- A batch hook (`usePrefs`), selectors, devtools, middleware helpers.
