# Contributing

## Reporting bugs

Open an issue with the entry point (`cookie-prefs`, `cookie-prefs/react`, `cookie-prefs/next` or `cookie-prefs/theme`), the versions of cookie-prefs, React, Next.js and Node.js, and a minimal reproduction.

## Development setup

Development needs Node.js 22 or newer (`.nvmrc` pins 22, so `nvm use` picks it); CI tests on Node.js 22 and 24. This is a toolchain requirement only: the published package declares no `engines`, so apps can install it on any Node.js version their Next.js and React support. Run `npm ci` to install.

## End-to-end tests

`e2e/` holds a Next.js App Router app and a Playwright suite (Chromium, production build) that run against the package packed from your checkout. Run one Next major at a time:

```bash
npm run e2e -- 16        # 14, 15 or 16: build and pack the package, install and build the app, run the tests
npm run e2e -- 15 test   # only the tests, against the app built last time (steps: pack, app, test)
npm run e2e -- 16 test -- -g theme   # arguments after the second `--` go to Playwright
```

The first run installs `e2e/`'s dependencies; if Chromium is missing, run `cd e2e && npx playwright install chromium`. The app is generated into `e2e/.apps/next<major>` (gitignored) from `e2e/app/`, with the versions pinned in `e2e/versions.json`; the specs are in `e2e/tests/`. CI runs the three majors in parallel as the `e2e` job; on failure it uploads the Playwright report and traces.

## Submitting changes

Nothing is pushed to `main` directly.

1. Open (or pick) an issue
2. Branch from `main`: `feat/...`, `fix/...`, `docs/...`, `ci/...`, `chore/...`
3. Make the change and add tests
4. Run `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run check:package` and `npm run size`; all must pass
5. Open a pull request with `Closes #N` in the body; CI runs automatically
6. A maintainer reviews and merges

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/) with a scope, one short lowercase subject line:

```text
feat(core): add cookie parser
fix(next): read cookies in route handlers
docs: add contributing guide
ci: add test matrix
```

- `feat` goes under **Added**, `fix` under **Fixed**, `refactor` / `perf` / `docs` / `ci` under **Changed** in the CHANGELOG; `chore` and `test` are not listed
- Mark a breaking change with `!` (`feat(core)!: ...`); it goes under **Breaking**
- No `Closes #N` in commit messages, only in the PR body; no co-author trailers

## Layout

```text
src/index.ts          cookie-prefs (zero-dependency core)
src/core/             core internals: builder, cookie, store, sync, reflect, types, standard-schema
src/react/index.tsx   cookie-prefs/react
src/next/index.tsx    cookie-prefs/next
src/theme/index.tsx   cookie-prefs/theme
e2e/                  Next.js app template and Playwright suite (not published)
```

Tests go in the `__tests__` folder next to the code they cover: `src/core/__tests__/`, `src/react/__tests__/`, `src/next/__tests__/` and `src/theme/__tests__/`. Vitest runs `*.test.ts` and `*.test.tsx`; `*.test-d.ts` files are type tests, checked by `npm run typecheck`.

The core must keep zero runtime dependencies and stay within the 2 KB gzip budget (`npm run size`).

## Releases

Releases are published by the maintainer with the manual **Release** workflow (Actions, Release, Run workflow, pick patch / minor / major). It needs a `RELEASE_TOKEN` secret (contents write access) and npm trusted publishing set up for the repository (see below for the first release).

The workflow checks and builds first, then publishes to npm, then commits the version bump and changelog to `main`, creates the tag and the GitHub release. If a step after the publish fails, fix the cause and re-run with the same bump: the publish is skipped when that version is already on npm. If the bump commit already landed, do not re-run; create the missing tag and release by hand.

### First release

Trusted publishing can only be configured for a package that already exists on npm, so 0.1.0 is published by hand. Later releases come from the workflow and carry a provenance attestation; the manually published 0.1.0 has none.

1. Bump locally with `npm version 0.1.0 --no-git-tag-version` and do not commit it. A plain `npm version` would create a commit and a local tag, while the workflow creates the tag through the API.
2. Run `npm run build`, then `npm pack --dry-run` and check that the listing includes `dist` (`dist` is gitignored and `npm pack` runs no build).
3. Run `npm publish`. The `prepublishOnly` script lints, type-checks, builds, tests and checks the package first.
4. Discard the local version change (`git checkout package.json package-lock.json`).
5. On npmjs.com, open the package settings and configure the trusted publisher: this repository and the workflow file `release.yml`.
6. Add the `RELEASE_TOKEN` secret, then run the Release workflow with `minor`. It computes 0.1.0, finds it on npm and skips publishing, commits the bump and the changelog, creates the tag and the GitHub release.
