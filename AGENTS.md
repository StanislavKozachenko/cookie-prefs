# AGENTS.md

Instructions for coding agents working in this repository.

## Project

cookie-prefs is typed cookie-backed user preference state for React and Next.js (theme, sidebar, density, locale): readable in Server Components and on the client, no hydration flash, cross-tab sync. The theme preset will be API-compatible with next-themes.

One package, five entries, each with its own source file:

| Import                | Source                |
| --------------------- | --------------------- |
| `cookie-prefs`        | `src/index.ts`        |
| `cookie-prefs/react`  | `src/react/index.tsx` |
| `cookie-prefs/script` | `src/script/index.ts` |
| `cookie-prefs/next`   | `src/next/index.tsx`  |
| `cookie-prefs/theme`  | `src/theme/index.tsx` |

The core internals (`builder`, `cookie`, `store`, `sync`, `reflect`, `types`, `standard-schema`) live in `src/core/`; `src/index.ts` is the entry that puts them together. Tests live in `__tests__` next to the code they cover: `src/core/__tests__/` (the core entry and its internals), `src/react/__tests__/`, `src/script/__tests__/`, `src/next/__tests__/` and `src/theme/__tests__/`. `*.test-d.ts` files are type tests, checked by `npm run typecheck` and never run; `src/core/__tests__/types.test-d.ts` pins the public types of every entry.

`demo/` is the live demo, a standalone Next.js app (own `package.json` and lockfile) that installs `cookie-prefs` from npm, not from `src/`; it is deployed on Vercel with root directory `demo` and CI type-checks and builds it (see `demo/README.md`).

Status: core, `cookie-prefs/react`, `cookie-prefs/script`, `cookie-prefs/next` and `cookie-prefs/theme` are implemented. `docs/design.md` is the contract.

## Commands

- `npm run build`: tsup, ESM + CJS + d.ts into `dist/`
- `npm test`: vitest, in the `node` environment; a test file that needs a DOM opts into jsdom with a `// @vitest-environment jsdom` comment at its top
- `npm run typecheck`: `tsc --noEmit`
- `npm run lint`: ESLint flat config
- `npm run check:package`: publint and arethetypeswrong (needs a build first)
- `npm run size`: size-limit, 2 KB gzip budget on the core entry plus budgets for `cookie-prefs/react`, `cookie-prefs/script`, `cookie-prefs/next` and `cookie-prefs/theme` (needs a build first)
- `npm run e2e -- <14|15|16>`: pack the package, build the Next app in `e2e/` for that major and run the Playwright suite in Chromium, Firefox and WebKit; see CONTRIBUTING.md. CI runs it as the `e2e` job; run it when a change touches `cookie-prefs/next`, `cookie-prefs/theme` or the inline script (`cookie-prefs/script`)
- `npm run e2e -- react-router`: the same for the React Router 7 SSR app in `e2e/react-router/` (`cookie-prefs/react` with `snapshotPrefs` and `prefsScript` outside Next). CI runs it as the `e2e-react-router` job; run it when a change touches `cookie-prefs/react` or the inline script

Run lint, typecheck, build, test, check:package and size before finishing a change.

## Rules

- The core (`cookie-prefs`) has zero runtime dependencies. `react` and `next` are optional peer dependencies and must never be imported from the core or the script entry.
- Keep the core within its size budget; do not raise the limit to make it pass.
- Do not disable lint rules or checks to get green; fix the cause.

## Commits

- Conventional Commits with a scope, a single short lowercase subject line, no body: `feat(core): add cookie parser`, `ci: add test matrix`
- No `Co-Authored-By`, no "Generated with" trailers, no agent attribution of any kind
- Commits are signed. Never bypass signing: no `--no-gpg-sign`, `--no-verify` or `-c commit.gpgsign=false`. If signing fails, stop and report the exact error
- Do not touch git config
- Make atomic commits

## Workflow

Nothing is committed or pushed to `main` directly, however small the change. The only exception is the release workflow's version bump.

1. Open an issue (see `.claude/commands/create-issue.md`)
2. Branch from an up-to-date `main`: `feat/...`, `fix/...`, `docs/...`, `ci/...`, `chore/...`
3. Open a pull request that closes the issue (see `.claude/commands/create-pr.md`)
4. Wait for CI. If a check fails, read the log and fix the cause before anything else
5. Squash-merge when `CI ok` is green and delete the branch

The `main` ruleset has an admin bypass. Do not use it.

Never tag or publish to npm without the maintainer's explicit approval.
