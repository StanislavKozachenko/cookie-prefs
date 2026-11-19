# Security, platform notes and non-goals

Constraints to know before shipping, and what cookie-prefs deliberately does not do. Back to the [README](../README.md).

## Security and platform notes

- **No secrets.** Prefs are written by the browser, so they are never `HttpOnly` and are readable by every script on the page. Never store secrets or session data in a pref. Cookie values are user input: invalid ones read as the default.
- **Cookie defaults.** `Path=/`, `SameSite=Lax`, `Max-Age` of 400 days (the cap browsers enforce; every write refreshes it), no `Domain`, and `Secure` added automatically on `https:` pages for browser writes. `toCookie()` omits `Secure` unless you set it. Change them for all prefs in `definePrefs(shape, options)` or per pref with `.options()`. `prefix: '__Host-'` opts into a cookie prefix and also needs `secure: true` and no `domain`. See the [core guide](core.md#cookie-options-and-defaults).
- **CSP and nonce.** The pre-paint script is an inline script: pass `nonce` to `PrefsProvider` (or `ThemeProvider`) when your policy requires one. The client re-applies reflections with plain DOM calls and never runs a script, so it needs no nonce. `disableTransitionOnChange` adds a `<style>` that carries the same nonce.
- **Trusted Types.** Under an enforced `require-trusted-types-for 'script'` policy, a `PrefsProvider` or `ThemeProvider` hydrated from server HTML works on React 18 and 19 (Next 14, 15 and 16 tested): React never writes the script's text, also when the provider re-renders or its props change, and the client applies prefs and themes with plain DOM calls. A provider that is first mounted on the client (not hydrated, for example in a nested layout first reached by a client-side navigation, in a component loaded with `ssr: false`, or remounted under a new `key`) sets the inert script's text through React, which the policy rejects.
- **Safari 7-day cap.** Safari caps cookies written through `document.cookie` at 7 days. To keep a pref from reverting a week after its last write, `usePref` and `ThemeProvider` re-write an existing cookie once per page load, with the same value, so the window counts from the last visit. Only cookies whose `maxAge` is longer than 7 days are refreshed, so a short-lived pref expires as configured. Only a cookie that holds a valid value exactly as cookie-prefs writes it is refreshed: an invalid value, or one this page does not accept (a theme only another subdomain sharing the cookie lists, a value from a newer release), reads as the default but is never overwritten by the refresh; only an explicit `set()` or `setTheme()` replaces it. A pref that no hook uses is refreshed only by `set()`. A cookie set by the server with `Set-Cookie` (for example in middleware, with `toCookie()`) keeps a long lifetime in Safari only for prefs that no hook in the page reads: the first load that renders a hook for that pref re-writes the cookie through `document.cookie`, which makes it a capped, script-written cookie again. This is based on WebKit's documentation and on CI, not on tests on real Safari or iOS devices: the end-to-end suite runs in Playwright's WebKit too, but that build does not apply Safari's tracking prevention, so it checks the refresh, not the cap.
- **One React context.** Two copies of `cookie-prefs/react` in one app mean two React contexts, so a provider from one copy does not reach hooks from the other. Keep a single installed version.
- **Sandboxed iframes.** Without `allow-same-origin`, the browser blocks cookie access: `get()` returns the default and `set()` does nothing, without throwing. `BroadcastChannel` cannot be created there either: `subscribe()` and `usePref` work without it.

## Non-goals

- A server-side theme helper (`getTheme`) and server rendering of the theme preset; `theme-color` management and a forced theme per page without a provider.
- Automatic `router.refresh()` after writes, and optimistic server sync.
- Async validators, versioning of stored values (renamed enum values are covered by [`.migrate()`](core.md#renamed-enum-values)), encryption or signing.
- `localStorage`, `sessionStorage` or a combined-cookie backend, and URL state (use nuqs).
- Reflection targets other than `<html>`, and system-preference resolution for prefs other than the theme.
- Batch hooks, selectors, devtools and middleware helpers.

The design decisions, verified facts and limitations are in [design.md](design.md).
