# Core and React guide

Builders, handles and server helpers of `cookie-prefs`, and `cookie-prefs/react` outside Next.js. Back to the [README](../README.md).

## Builders

`pref.enum([...])`, `pref.boolean()`, `pref.number()`, `pref.string()`, `pref.json(schema)` and `pref.custom({ parse, serialize })`. Each takes `.default(value)` (removes `undefined` from the read type) and `.options({ name, path, maxAge, ... })`; enum, boolean, number and string also take `.reflect(...)` (see [Reflection](reflection.md)).

`pref.json` requires a synchronous [Standard Schema](https://standardschema.dev) validator (zod, valibot, arktype), because cookies are user-controlled input. Writes take the schema's input type, reads return its output. For anything else use `pref.custom`.

```ts
import { definePrefs, pref, readPrefs } from 'cookie-prefs'
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

Treat the values you read as read-only. In the browser `get()` and `read()` return the same object for the same cookie to every caller (that keeps `usePref` from re-rendering), so mutating a `json` or `custom` value changes it for everyone until the cookie changes; copy it and `set()` the copy instead. On the server every `read()` parses again, so one request never sees another's value. A `.default()` value is returned as is, on the server too: never mutate it.

`subscribe()` listeners run synchronously, in subscription order, and only when the value changed. A listener that throws does not stop the others and never makes `set()` throw; its error is thrown again from a timer, so it still reaches `window.onerror` and error monitoring. Subscribing the same function twice registers it once.

Other tabs' writes reach subscribers at once (CookieStore `change` events, or a `BroadcastChannel` message where CookieStore is missing). A change nothing announces, such as a server `Set-Cookie` without CookieStore or a write from a tab on a sibling subdomain, is picked up when the tab becomes visible again.

`toCookie()` returns the cookie as `{ name, value, path, maxAge, sameSite, ... }`, which Next.js `cookies().set()` accepts. Its `value` is not URI-encoded: frameworks encode on set, but if you write a raw `Set-Cookie` header yourself, pass the value through `encodeURIComponent`. `maxAge` is in seconds, like the `Max-Age` attribute; Express `res.cookie` takes milliseconds, so multiply it there:

```ts
const { name, value, maxAge, ...options } = prefs.density.toCookie('compact')
res.cookie(name, value, { ...options, maxAge: maxAge * 1000 })
```

## Cookie options and defaults

`Path=/`, `SameSite=Lax`, `Max-Age` of 400 days (the cap browsers enforce; every write refreshes it), no `Domain`, and `Secure` added automatically on `https:` pages for browser writes. `toCookie()` omits `Secure` unless you set it. Change them for all prefs in `definePrefs(shape, options)` or per pref with `.options()`. An option set to `undefined` (or `null` in JavaScript) counts as not set and falls through to the earlier `.options()`, then the `definePrefs` options, then the default, so a conditional such as `{ domain: isProd ? 'example.com' : undefined }` is safe. `prefix: '__Host-'` opts into a cookie prefix and also needs `secure: true` and no `domain`.

## `cookie-prefs/react` outside Next.js

`usePref(pref)` returns `[value, setValue]`. Every component using the same pref stays in sync, also across tabs.

Outside Next.js (Vite, Remix, TanStack Start), wrap the app once so the server render sees the request's cookies and the pre-paint script is emitted:

```tsx
import { prefsScript, snapshotPrefs } from 'cookie-prefs'
import { PrefsProvider } from 'cookie-prefs/react'

<PrefsProvider snapshot={snapshotPrefs(prefs, cookieHeader)} script={prefsScript(prefs)} nonce={nonce}>
  <App />
</PrefsProvider>
```

`snapshot` holds only the raw cookies of your prefs and is serializable. Omit it for a static page: hooks then render defaults until hydration ends. Place the provider at the top of `<body>`.

The client must hydrate with the same snapshot the server rendered with: pass it down (loader data, serialized props, an inline JSON script) and give it to the client `PrefsProvider`. During SSR and hydration `usePref` returns the value from the nearest provider's `snapshot`, or the default when there is none. Without the snapshot on the client, hooks render defaults while the server HTML holds the cookie values, and React reports a hydration mismatch. The pre-paint script changes `<html>` attributes before hydration, so put `suppressHydrationWarning` on `<html>` (in the Pages Router, in `_document`).

In the Pages Router, compute the snapshot in `getServerSideProps` and pass it to the provider in `_app`.

See also: [Next.js guide](nextjs.md), [security and platform notes](security.md).
