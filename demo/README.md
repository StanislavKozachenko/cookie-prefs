# cookie-prefs demo

The live demo of [cookie-prefs](https://github.com/StanislavKozachenko/cookie-prefs), deployed at [cookie-prefs.vercel.app](https://cookie-prefs.vercel.app): one mock dashboard, built twice.

| Route            | What it shows                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`              | Preferences in cookies with `cookie-prefs/next` (`mode="server"`). The server reads them with `getPrefs` and renders the right rows, locale and controls in the first response; theme, sidebar and density are on `<html>` before first paint. |
| `/local-storage` | The same app with preferences in `localStorage`, the usual way: a blocking script for the theme (like next-themes), React state for the rest. The server renders the defaults and the page corrects itself after hydration. |
| `/compare`       | Both side by side in iframes, with "Reload both".                                                                                                                                                                  |

Add `?embed=1` to `/` or `/local-storage` to hide the demo's own navigation; the compare page loads both that way.

The demo installs `cookie-prefs` from npm, not from the repository's `src/`, so it also checks a real install. The preferences are defined once in [`app/prefs.ts`](app/prefs.ts).

## Run locally

```sh
cd demo
npm ci
npm run dev        # http://localhost:3000
npm run build && npm start   # production build, what Vercel serves
npm run typecheck
```

## Deploy on Vercel

Import the repository and set **Root Directory** to `demo`. Everything else stays on the defaults (framework preset Next.js, `npm install`, `next build`). The demo needs no environment variables and makes no external requests; the Geist fonts are self-hosted from the `geist` package.

## The README GIF

`gif/` holds the scripts that record `.github/demo.gif`, with their own `package.json` so the demo itself stays free of them. With the production build running (`npm run build && npm start`):

```sh
cd demo/gif
npm ci
npx playwright-core install chromium
npm run gif        # record.mjs, captions.mjs, compose.mjs -> ../../.github/demo.gif
```

`record.mjs` drives the demo and logs a timeline (cursor, clicks, zooms, captions); `captions.mjs` renders the caption pills; `compose.mjs` builds the GIF from the frames and the timeline. The side-by-side reload is recorded with network and CPU throttling (1.6 Mbps, 150 ms latency, 4x CPU slowdown) so the first paint stays on screen long enough to see; the pause frame is the last one before the `localStorage` page reports hydration.
