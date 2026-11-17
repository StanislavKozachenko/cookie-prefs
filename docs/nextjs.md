# Next.js guide

`prefkit/next`: `PrefsProvider` modes, refreshing server output, nonce and how request cookies are read. Back to the [README](../README.md).

`prefkit/next` is a server-only entry for the App Router with two exports, `PrefsProvider` (an async Server Component) and `getPrefs`; see the Quick start in the README. Both read the request's raw `Cookie` header and parse it the way the browser parses `document.cookie` (the first of duplicate cookies wins, quotes are stripped), so the server never disagrees with what the inline script already put on `<html>`. A pref cookie set or deleted earlier in the same request (in a Server Action or in middleware) is taken from `cookies()` instead, so `getPrefs` and `mode="server"` see it in that same response.

## Modes

`PrefsProvider` takes a `mode`:

| `mode`               | Route           | Hooks during SSR and hydration |
| -------------------- | --------------- | ------------------------------ |
| `"script"` (default) | stays static    | render the defaults            |
| `"server"`           | becomes dynamic | render the exact cookie values |

In `script` mode the inline script has already put the right attributes on `<html>`, so anything visible before hydration must come from those attributes and CSS (see [Reflection](reflection.md)), not from the value a hook returns. After hydration hooks switch to the cookie value. Use `mode="server"` when the app is dynamic anyway and you want exact server-rendered output:

```tsx
<PrefsProvider prefs={prefs} mode="server">{children}</PrefsProvider>
```

Put `suppressHydrationWarning` on `<html>`: the inline script changes its attributes before React hydrates.

With Cache Components, `mode="server"` needs `export const instant = false` in the layout, and `getPrefs` must be called inside `<Suspense>`.

## Refreshing server output

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

## Nonce

Pass a CSP nonce with `<PrefsProvider prefs={prefs} nonce={nonce}>`, for example from `(await headers()).get('x-nonce') ?? undefined` (`get()` returns `string | null`, the prop takes `string | undefined`). See also [security and platform notes](security.md).

Outside Next.js, see [Core and React guide](core.md).
