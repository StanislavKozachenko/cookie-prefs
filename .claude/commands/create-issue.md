Create a GitHub issue for the cookie-prefs project following the project's established conventions.

## Issue format

**Title:** `"Area: short description"` — the area is an entry (`core`, `react`, `next`, `theme`) or a repo area (`Setup`, `CI`, `Release`, `Dependabot`, `Docs`)

Examples:
- `core: invalid cookie value falls back to the default`
- `next: read prefs in Server Components`
- `theme: resolvedTheme is undefined on the first client render`
- `CI: fail on high or critical dependency advisories`

**Body:** an optional one or two sentences of context (what is wrong or missing, with a source when it is about React, Next.js or browser behaviour), then a bullet list of deliverables. Each bullet covers one concrete deliverable. The last bullet says how it is verified.

Example body:
```
A cookie holding a value outside the enum makes `usePref` return it as is.

- Validate the parsed value against the pref's parser and fall back to the default
- Unit tests for unknown, empty and malformed values
- Verified in the Next.js test app: no hydration warning with a tampered cookie
```

## Steps

1. Ask the user what the issue is about if not already clear from context.
2. Determine the area and short description.
3. Draft the body.
4. Choose labels (at least one):
   - `enhancement` — new feature or improvement
   - `bug` — something is broken
   - `area: core`, `area: react`, `area: next`, `area: theme` — the entry it concerns
   - `documentation`, `ci/cd`, `chore`, `breaking`

5. Create the issue:

```sh
gh issue create \
  --title "Area: short description" \
  --label "enhancement" --label "area: core" \
  --assignee "StanislavKozachenko" \
  --body "$(cat <<'EOF'
- bullet 1 with `code`
- bullet 2
EOF
)"
```

**IMPORTANT — backtick escaping:** inside the `<<'EOF'` heredoc, never escape backticks. Write `` `code` ``, not `` \`code\` ``: the quoted EOF keeps the content literal, so a backslash reaches GitHub and breaks the Markdown.

6. Report the issue URL and number to the user.
