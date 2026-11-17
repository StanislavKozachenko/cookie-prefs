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
        {/* mode="script" (default): route stays static; mode="server": exact SSR from the Cookie header */}
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
- The theme preset stores in a cookie named `storageKey` (default `theme`), reads a next-themes value from `localStorage[storageKey]` once when the cookie is missing and moves it to the cookie (removing it from `localStorage`), passes nested providers through like next-themes, and is script-mode only (no `cookies()` read).

## Verified facts (2026-11-16)

| Fact | Effect on the design | Source |
| --- | --- | --- |
| `cookies()` is async (since 15.0 RC); readable in Server Components; `.set`/`.delete` only in Server Functions and Route Handlers ("HTTP does not allow setting cookies after streaming starts") | `getPrefs` is async; server writes use `toCookie()` in a Server Function | https://nextjs.org/docs/app/api-reference/functions/cookies |
| Without Cache Components, `cookies()` in a layout makes the route dynamic; with Cache Components, outside `<Suspense>` it blocks prerendering | `mode="script"` default; `getPrefs` documented as dynamic | same, and https://nextjs.org/docs/messages/blocking-prerender-runtime |
| `cookies()` parses the `Cookie` header with `@edge-runtime/cookies`: the last duplicate wins and quotes are kept, unlike `document.cookie` and the inline script. `headers()` has the same static/dynamic handling as `cookies()` (Next 16.4.6 `dist/server/request/headers.js`), but does not show cookies written earlier in the same request | `prefkit/next` reads `(await headers()).get('cookie')` and lets the core parse it; a Server Function write shows from the next request | `next/dist/compiled/@edge-runtime/cookies`, `next/dist/server/async-storage/request-store.js` |
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
- **Next `PrefsProvider`** is an async Server Component: in `'server'` mode it reads the raw `Cookie` header from `headers()` and passes `snapshotPrefs(prefs, header)`, as `getPrefs` reads it (never `cookies()`, whose parsing differs from the browser's); in both modes it passes `prefsScript(prefs)` and `nonce` to the client `PrefsProvider` from `'prefkit/react'`. `prefs` itself never crosses to the client.
- **Snapshots must be stable** for `useSyncExternalStore`: cache the parsed value per pref by raw string, so `json` and `custom` prefs do not return a new object on every read.
- **Own-write echo.** The CookieStore `change` event also fires for this tab's writes; compare raw values before notifying.
- **Encoding.** Names and values are `encodeURIComponent`-encoded; booleans are `'true'`/`'false'`; enums and numbers are stored as is; `json` is `JSON.stringify` then encoded.
- **Encoding at the edges.** `Pref.name` is the encoded cookie name (the key in `document.cookie`, the `Cookie` header and `PrefsSnapshot`). Snapshots and cookie stores/maps passed as `CookieSource` hold URI-decoded values; only a header string is decoded by prefkit. `toCookie().value` is not URI-encoded: frameworks encode on set, code writing a raw `Set-Cookie` header must call `encodeURIComponent`.
- **Nonce.** Browsers hide `nonce` after load, so render it on the server only or keep `suppressHydrationWarning` on the script. The React `PrefsProvider` renders `type` and `nonce` from `typeof document` at render time (server: `text/javascript` + nonce; client: `text/plain`, no nonce) with `suppressHydrationWarning`; hydration never patches attributes, so the server element keeps its nonce.
- **Re-applying reflection.** The client provider runs the `script` string again in a layout effect on mount (dev Strict Mode / remounts can reset `<html>`) and on `visibilitychange` to visible, so prefs nobody in this tab subscribes to follow other tabs when the tab is shown again (subscribed prefs follow at once through the store). Nothing is executed: `prefkit/react` reads the JSON config back from the `script` string (the fixed source ends in `})(` and holds `})("` nowhere else, and the string literal after it escapes every `"`, so the first `})("` marks the start of the literal, which runs to the final `)`) and applies it from `document.cookie` with `classList`, `setAttribute` and `style`. That code is a step-by-step port of the inline script (cookie lookup, decoding, validation, default, class swap, removal, per-pref `try`); a parity test runs both over a table of configs and cookies, so keep them in sync. With no script element, `eval` or script text assignment, CSP and enforced Trusted Types (`require-trusted-types-for 'script'`) have nothing to check, and the client needs no nonce; it stays on the server-rendered script. No core export was needed. The provider renders only its first `script` string for its whole lifetime: new text on a hydrated `<script>` would be an `innerHTML` write that enforced Trusted Types reject, and the element already ran or is inert. A later `script` is still re-applied.
- **Script config as a string.** The inline script gets its config as JSON inside a JSON string literal and `JSON.parse`s it. As an object literal, an enum value named `__proto__` would set the map's prototype instead of a key, so the script would read it as invalid while the client (`Object.fromEntries`) accepts it. The literal is ES5 once U+2028/U+2029 are escaped; `<`, `>` and `&` stay escaped for HTML.
- **Reflection on every check.** The store applies `<html>` reflection on every `set`/`reset` and every re-check, before the `Object.is` guard that only gates listeners. The last value a handle saw goes stale while nothing subscribes (the provider's re-apply, another tab, a server `Set-Cookie`), so guarding the DOM write with it lost updates, e.g. a hook-less `set(o => !o)` after another tab toggled back.
- **Client and script apply alike.** `apply()` mirrors the script's single `try` per pref: an invalid attribute name or class stops that pref's remaining targets, and the class swap iterates the value map with `for…in` like the script. In development (`process.env.NODE_ENV != 'production'`, which bundlers replace and drop from production builds, so it costs nothing in the size budget) `definePrefs()` throws when a `'class'` target maps a value to an empty class or one with ASCII whitespace, which `classList` would reject for every value.
- **Reflected strings are cookie-controlled.** A reflected `pref.string()` (or a number) writes whatever the cookie holds into a `data-*` attribute or CSS variable. Cookies can be set by sibling subdomains (cookie tossing) or by the user, so only reflect free-form strings whose value you would accept from an attacker in that attribute or variable (no `url()` in the variable, no selectors that leak it); prefer an enum.
- **Unreadable cookies.** In a sandboxed iframe without `allow-same-origin` (opaque origin) reading or writing `document.cookie` throws. `get()` then returns the default, and `set()`/`reset()` write nothing, notify nothing and never throw. The inline script throws there too and leaves `<html>` alone.
- **Lone surrogates.** `encodeURIComponent` throws on lone UTF-16 surrogates (e.g. `'😀abc'.slice(1)`). `set()` stores them as U+FFFD via `String.prototype.toWellFormed` where it exists (browsers since 2023, Node 20); without it nothing is written and `set()` does not throw. `json` prefs are unaffected, since `JSON.stringify` escapes lone surrogates. `toCookie()` returns the value as is, so a framework that encodes it may still throw.
- **Safari's 7-day cap.** Safari (ITP) caps cookies written through `document.cookie` at 7 days, whatever `Max-Age` says (https://webkit.org/blog/8613/intelligent-tracking-prevention-2-1/). Reads never refresh a cookie, so without help a pref would revert 7 days after its last write, even for a daily visitor. `usePref` therefore re-writes the pref's cookie once per handle per page load, in an effect (never during render, never on the server), so the window slides with visits. It writes only when the cookie already exists (the string search `'; ' + name + '='` in `document.cookie`, since the core has no "is present" call; an invalid value counts as present and is written back as the default), only when the value is defined, and only when parsing the written string gives back the very same value (`pref.read({ [name]: pref.toCookie(value).value }) === value`, so a json value whose stored text would change is left alone). The core then sees no change and notifies nobody: no re-render, no hydration mismatch. A module-level `WeakSet` of handles makes Strict Mode's second effect run and other components using the same pref a no-op. The write uses the handle's attributes, which must match those of any server write (`toCookie()` uses the same). Prefs no hook uses are refreshed only by `set()`. A cookie set by the server (`Set-Cookie`, e.g. middleware writing `pref.toCookie(value)`) is not capped, so apps that need long-lived prefs in Safari without visits can write them there.
- **Nested providers** merge their snapshots (inner keys win); a provider without a snapshot keeps the outer one.
- **Script mode trade-off.** Hooks render defaults until hydration ends; anything visible before hydration must come from reflected attributes plus CSS. Document this next to `mode`.
- **`get()` on the server** returns the default; add a dev-only warning pointing to `read()` / `getPrefs()`.
- **Size budget.** All of core (parsers, cookie codec, store, sync, Standard Schema glue, reflection, `prefsScript` source) must fit 2 KB gzip. If it cannot, discuss moving `prefsScript` before touching the limit.
- **Tooling.** `tsconfig.json` uses `"jsx": "react-jsx"`; its `paths` and the vitest `resolve.alias` map `prefkit` and `prefkit/react` to `src/`, so typecheck and tests run from source while tsup keeps them external.
- **Sizes.** `size-limit` checks `prefkit/react`, `prefkit/next` and `prefkit/theme` too, with peers and core excluded.

### Theme preset (`prefkit/theme`)

- **Storage.** One `pref.enum(...).default(defaultTheme).options({ ...cookie, name: storageKey })` per provider, built with the core and keyed on the provider's config and on `cookie` as JSON (inline `themes` / `value` / `cookie` literals do not recreate it or re-run its effects). `cookie` is the one prop next-themes does not have: the core's `CookieOptions` (`domain`, `sameSite`, `secure`, `partitioned`, `path`, `maxAge`), so the theme can be shared across subdomains (`domain`) or written inside a cross-site iframe (`sameSite: 'none'`, `secure`, `partitioned`), where the default `SameSite=Lax` write is rejected. Valid stored names are `themes`, the keys of `value` (the next-themes README stores `pink` with only `value={{ pink: ... }}`) and `'system'` when `enableSystem` is on. Core `.reflect('class')` is not used, since it would write `system` as a class. `setTheme` ignores names outside that list instead of writing a cookie that reads back as the default.
- **Inline script** (`src/theme/script.ts`). Fixed ES5 source called with `.apply(0, config)`, where the config is JSON with `<`, `>`, `&`, U+2028 and U+2029 escaped (a local copy of the core helper, which is internal): cookie name, `localStorage` key, attributes, a map from every valid stored name to its DOM value, default, forced theme, `enableSystem` and the fallback `color-scheme`. It reads the cookie (URI-decoded, quotes stripped, validated, default on a miss or a decoding error), or `localStorage[storageKey]` when the cookie is absent, then applies `forcedTheme` first, resolves `system` with `matchMedia`, maps through `value`, swaps the class / sets the attributes and sets `color-scheme`. The source never comes from `Function.prototype.toString`, so `keepNames` / SWC `__name` helpers cannot break it (next-themes #370). It is rendered like `PrefsProvider`'s script: `text/javascript` plus nonce on the server, `text/plain` on the client, `suppressHydrationWarning` (next-themes #385, #387). `scriptProps` are spread first, so they cannot change `type`, `nonce` or the content. The provider renders only its first script string for its whole lifetime: later prop changes (a `forcedTheme` per route) would otherwise make React write new text into the hydrated `<script>`, which enforced Trusted Types reject and which is useless anyway, since the element already ran or is inert. The live config drives the client.
- **Client.** `theme` comes from `useSyncExternalStore` over the pref and `systemTheme` from one over `matchMedia` `change` events (through `addListener` in Safari and iOS before 14, which lack `MediaQueryList.addEventListener`, as next-themes does); both use `undefined` as the server snapshot, so `theme`, `resolvedTheme` and `systemTheme` are `undefined` during SSR and hydration and resolve right after. One layout effect runs on mount and on every change: it migrates `localStorage` once or, the first time a provider sees an existing theme cookie in this page load, re-writes it with the same value against Safari's 7-day cap (see the implementation note; a module-level set of cookie names keeps it to once across Strict Mode, remounts and prop changes, and an enum value always reads back the same, so nothing re-renders), then calls `paint`, a step-by-step DOM port of the script (no script element, no `eval`, so CSP and Trusted Types have nothing to check), and listens for `visibilitychange` to repaint and re-read the cookie. `paint` always reads the current cookie, never rendered state, so an effect that re-runs when `<Activity>` reveals a cached tree cannot bring back an old theme (next-themes #375). A parity test runs the script and the client over a table of configs and cookie / storage states; keep both in sync.
- **Migration.** When the cookie is absent and `localStorage[storageKey]` holds a valid name, the client writes it to the cookie (the script already painted it) and, once the cookie reads back, removes the `localStorage` key; an invalid value is removed too. So the move runs once: when the cookie later goes away (expiry, Safari's cap on script-written cookies, cookies cleared) the theme falls back to the default, in the script and on the client alike, instead of an old next-themes value coming back over a newer choice. The trade-off: rolling back to next-themes no longer keeps the user's choice; it starts from its default. When the cookie write does not stick (cookies blocked) the value stays, so nothing is lost. Storage that throws on access, read or removal is ignored.
- **`disableTransitionOnChange`.** As in next-themes: a `<style>` that sets `transition: none` on everything is appended, the theme is applied, a computed style is read to force a restyle, and the style is removed on the next tick. The style carries `nonce`, so a strict `style-src 'nonce-…'` policy allows it. Without a nonce, such a policy blocks the style: transitions are not disabled, the theme still switches.
- **Differences from next-themes 0.4.6.** The choice is a cookie, not `localStorage`. Invalid stored values and invalid `setTheme` names fall back to or keep a valid theme, where next-themes applies any string. `value` is applied the same way by the script and the client (next-themes' script ignores it for `data-*` attributes, and the client removes the attribute for unmapped names). A forced `'system'` is resolved by the script too. `color-scheme` is set the same way before and after hydration. Class removal covers every valid theme's DOM value. Only `class` and `data-*` targets exist (types). `theme` is `undefined` during hydration, where next-themes already returns the `localStorage` value and so mismatches without a mounted guard. Other tabs are followed through the core (CookieStore or BroadcastChannel) instead of the `storage` event. The transition style drops the obsolete vendor prefixes.
- **Known limitations.** A `ThemeProvider` first mounted on the client (not hydrated) sets the inert script's text through React, which enforced Trusted Types reject, as for `PrefsProvider`. With cookies blocked, the script shows the `localStorage` value but the client falls back to the default. A forced theme outside the valid list keeps its class after `forcedTheme` is removed. The preset is script-mode only; no server helper (see non-goals).

## Non-goals for v1

- Server-side theme helper (`getTheme`) and SSR of the theme preset; the cookie is plain `storageKey` and readable with `cookies()`.
- `theme-color` meta management (next-themes #78) and per-page forced theme without a provider (#226).
- Automatic `router.refresh()` after writes, Server Action writes, optimistic server sync.
- Pages Router integration (use `prefkit/react` with `snapshotPrefs` in `getServerSideProps`).
- Async Standard Schema validation, migrations or versioning of stored values, encryption or signing.
- Combined cookies, `localStorage` or `sessionStorage` backends, URL state (use nuqs).
- Reflection targets other than `<html>`, and system-preference resolution for generic prefs (the theme preset owns it).
- A batch hook (`usePrefs`), selectors, devtools, middleware helpers.
