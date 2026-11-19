# Roadmap to 1.0

## Where the project is

cookie-prefs is at 0.1.3 on npm. The core, `cookie-prefs/react`, `cookie-prefs/script`, `cookie-prefs/next` and the theme entries are implemented. The next release will be 0.2.0, because moving `prefsScript` to `cookie-prefs/script` (#78) is a breaking change. Until 1.0 the API can still change in a minor release, even though [design.md](design.md) calls the public types final.

## Done since 0.1.3

- [x] `prefsScript` moved from `cookie-prefs` to `cookie-prefs/script`, which gave the core size headroom (#78)
- [x] Renamed enum values migrate with `.migrate()` (#85)
- [x] The end-to-end suite runs in Chromium, Firefox and WebKit (#84)
- [x] SSR outside Next.js is covered by a React Router 7 app in the end-to-end suite (#88)
- [x] The stored theme can be read on the server with `readTheme` and `getTheme` (#89)
- [x] `<meta name="theme-color">` follows the theme with the opt-in `ThemeColor` from `cookie-prefs/theme/color` (#90)
- [x] Several prefs in one hook with `usePrefs` from `cookie-prefs/react` (#93)

## Before 1.0

- [ ] A manual check on real Safari, on macOS and on iOS, of the 7-day cap on script-written cookies and of the refresh that works around it (see [security notes](security.md)). Playwright's WebKit does not apply tracking prevention, so the end-to-end suite cannot show this.
- [x] Cross-tab sync without `CookieStore`, through the `BroadcastChannel` fallback, is covered by an end-to-end test (#97, #101).
- [ ] A 0.x release after which no breaking change is needed: the API stays as it is for one more minor release.
- [ ] The [live demo](../demo/) runs on that release.
- [ ] No bug is open in the issue tracker.

## What 1.0 promises

- Semantic versioning for every entry in `exports` of [package.json](../package.json): `cookie-prefs`, `cookie-prefs/react`, `cookie-prefs/next`, `cookie-prefs/script`, `cookie-prefs/theme`, `cookie-prefs/theme/server`, `cookie-prefs/theme/next` and `cookie-prefs/theme/color`.
- What no entry exports, or what the source marks as internal, is not part of the promise.
- The supported ranges are the peer dependencies: `react` `>=18` and `next` `>=14`, both optional. CI runs the unit tests on Node.js 22 and 24 on Linux, Windows and macOS, the type check and tests against React 18, and the end-to-end suite against Next.js 14.2.35 (React 18.3.1), 15.5.29 and 16.4.6 (React 19.3.1; versions pinned in [e2e/versions.json](../e2e/versions.json)), plus a React Router 7 app. The ranges are open-ended, so newer majors are untested until CI is updated.
- The gzip size budgets in `size-limit` of [package.json](../package.json) are enforced in CI. The core entry stays within 2 KB.

## Not planned

See the non-goals in [design.md](design.md#non-goals-for-v1).
