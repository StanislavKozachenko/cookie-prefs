/**
 * Cross-tab sync. Other tabs' writes arrive as a CookieStore `change` event where the
 * API exists, else as a message on a BroadcastChannel posted after each write. Changes
 * nothing announces (a server `Set-Cookie` without CookieStore, a tab on a sibling
 * subdomain) are picked up when the tab becomes visible. Every time, each subscribed
 * pref re-reads `document.cookie` and notifies only if its value changed, which also
 * drops the echo of this tab's own writes.
 */

/**
 * A channel to the other tabs, when they cannot learn about writes from CookieStore.
 * None where `BroadcastChannel` is missing or throws (an opaque origin, e.g. a
 * sandboxed iframe): writes then reach only this tab.
 */
const open = () => {
  try {
    return globalThis.cookieStore ? undefined : new BroadcastChannel('cookie-prefs');
  } catch {
    // no channel
  }
};

/** Re-check functions of prefs that have at least one listener. */
const subs = new Set<() => void>();
let off: (() => void) | undefined;

const changed = () => subs.forEach((check) => check());
/** Re-check on `visibilitychange` once the tab is shown, like `PrefsProvider` re-applies `<html>`. */
const shown = () => document.visibilityState == 'visible' && changed();

/** Add or remove a pref's re-check; attaches the listeners on the first, detaches them on the last. */
export const hub = (check: () => void, on: boolean) => {
  if (on) subs.add(check);
  else subs.delete(check);
  if (!subs.size) {
    off?.();
    off = undefined;
  } else if (!off) {
    const store = globalThis.cookieStore;
    const channel = open();
    store?.addEventListener('change', changed);
    document.addEventListener('visibilitychange', shown);
    if (channel) channel.onmessage = changed;
    off = () => {
      store?.removeEventListener('change', changed);
      document.removeEventListener('visibilitychange', shown);
      channel?.close();
    };
  }
};

/** Tell other tabs a pref changed, when they cannot learn it from CookieStore. */
export const post = () => {
  const channel = open();
  channel?.postMessage(0);
  channel?.close();
};
