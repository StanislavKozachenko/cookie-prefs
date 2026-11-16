Create a GitHub pull request for the prefkit project following the project's established conventions.

## PR format

**Title:** a single Conventional Commits line. PRs are squash-merged and the title becomes the commit on `main`, and the release workflow builds the CHANGELOG from those commits.

- `feat(core): add cookie parser and serializer`
- `fix(react): keep the server snapshot during hydration`
- `feat(theme): add next-themes compatible ThemeProvider`
- `ci: fail on high or critical dependency advisories`
- `docs: describe the script rendering mode`

The scope is the entry the change is in: `core`, `react`, `next` or `theme`. `!` after the type marks a breaking change.

**Body:** short — the details are in the issue.

```
Closes #N

- What changed, in one line per key change
- How it was tested (unit tests, test app)
```

## Steps

1. `git log main..HEAD --oneline` and `git diff main...HEAD -- . ':(exclude)package-lock.json'` to see the change.
2. Identify the issue it closes (ask the user if not clear).
3. Push the branch if needed: `git push -u origin <branch>`.
4. Create the PR with the same labels as the issue:

```sh
gh pr create \
  --title "feat(core): short description" \
  --label "enhancement" --label "area: core" \
  --assignee "StanislavKozachenko" \
  --body "$(cat <<'EOF'
Closes #N

- Key change
- Tests: what they cover
EOF
)"
```

5. Wait for CI: `gh pr checks <n> --watch`. When `CI ok` is green, merge: `gh pr merge <n> --squash --delete-branch`. If a check fails, read its log and fix the cause before doing anything else.
6. Sync: `git checkout main && git pull --ff-only`.
7. Report the PR URL to the user.

## Rules
- `Closes #N` goes only in the PR body, never in commit messages
- Commit messages are one line, no body, no co-author trailers
- No AI attribution anywhere ("Generated with …", co-author lines)
- Always set `--label` and `--assignee StanislavKozachenko` on issues and PRs
- One change per branch, issue and PR; branch from an up-to-date `main`
