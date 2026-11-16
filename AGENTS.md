# AGENTS.md

Instructions for coding agents working in this repository.

## Project

prefkit is typed cookie-backed user preference state for React and Next.js (theme, sidebar, density, locale): readable in Server Components and on the client, no hydration flash, cross-tab sync. The theme preset will be API-compatible with next-themes.

One package, four entries, each with its own source file:

| Import          | Source               |
| --------------- | -------------------- |
| `prefkit`       | `src/index.ts`       |
| `prefkit/react` | `src/react/index.ts` |
| `prefkit/next`  | `src/next/index.ts`  |
| `prefkit/theme` | `src/theme/index.ts` |

Status: scaffold only; entries export placeholders.

## Commands

- `npm run build`: tsup, ESM + CJS + d.ts into `dist/`
- `npm test`: vitest (jsdom)
- `npm run typecheck`: `tsc --noEmit`
- `npm run lint`: ESLint flat config
- `npm run check:package`: publint and arethetypeswrong (needs a build first)
- `npm run size`: size-limit, 2 KB gzip budget on the core entry (needs a build first)

Run lint, typecheck, build, test, check:package and size before finishing a change.

## Rules

- The core (`prefkit`) has zero runtime dependencies. `react` and `next` are optional peer dependencies and must never be imported from the core entry.
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
