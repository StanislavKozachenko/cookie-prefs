# Contributing

## Reporting bugs

Open an issue with the entry point (`prefkit`, `prefkit/react`, `prefkit/next` or `prefkit/theme`), the versions of prefkit, React, Next.js and Node.js, and a minimal reproduction.

## Development setup

Development needs Node.js 22 or newer (`.nvmrc` pins 22, so `nvm use` picks it); CI tests on Node.js 22 and 24. This is a toolchain requirement only: the published package declares no `engines`, so apps can install it on any Node.js version their Next.js and React support. Run `npm ci` to install.

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
src/index.ts          prefkit (zero-dependency core)
src/react/index.tsx   prefkit/react
src/next/index.tsx    prefkit/next
src/theme/index.tsx   prefkit/theme
```

The core must keep zero runtime dependencies and stay within the 2 KB gzip budget (`npm run size`).

## Releases

Releases are published by the maintainer with the manual **Release** workflow (Actions, Release, Run workflow, pick patch / minor / major). It needs a `RELEASE_TOKEN` secret (contents write access) and npm publishing set up for the repository.

The workflow checks and builds first, then publishes to npm, then commits the version bump and changelog to `main`, creates the tag and the GitHub release. If a step after the publish fails, fix the cause and re-run with the same bump: the publish is skipped when that version is already on npm. If the bump commit already landed, do not re-run; create the missing tag and release by hand.
