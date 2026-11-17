# Reflection

Mirror a pref on `<html>` before first paint so CSS can react to it. Back to the [README](../README.md).

`.reflect(target)` mirrors a pref on `<html>` before first paint and after every change. A target is:

- `'class'` (enums only): adds the current value as a class and removes the others
- `'data-*'`: sets an attribute
- `'--name'`: sets a CSS custom property

`.reflect` also takes a list of targets, and enums can map values to different DOM strings with a second argument: `.reflect('data-density', { compact: 'tight' })`.

```ts
density: pref.enum(['compact', 'cozy']).default('cozy').reflect('data-density'),
sidebar: pref.boolean().default(true).reflect('data-sidebar'),
```

```css
[data-density='compact'] .card { padding: 0.5rem; }
[data-sidebar='false'] .sidebar { display: none; }
```

Reflected free-form strings and numbers are written into the DOM exactly as the cookie holds them, and cookies can be set by the user or by sibling subdomains. Reflect a `pref.string()` only if you would accept an attacker-chosen value in that attribute or CSS variable (no `url()` in the variable, no selectors that leak it). Prefer an enum.

Reflection targets other than `<html>` are a non-goal; see [security and platform notes](security.md#non-goals). In `script` mode of [Next.js](nextjs.md#modes), reflection is how pre-hydration output reacts to a pref.
