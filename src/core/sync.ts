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
/** The listening channel, while `subs` is not empty. */
let channel: BroadcastChannel | undefined;

const changed = () => subs.forEach((check) => check());
/** Re-check on `visibilitychange` once the tab is shown, like `PrefsProvider` re-applies `<html>`. */
const shown = () => document.visibilityState == 'visible' && changed();

/**
 * Add or remove a pref's re-check; attaches the listeners on the first, detaches them
 * after the last. Removing a re-check that is not there changes nothing.
 */
export const hub = (check: () => void, on: boolean) => {
  if (on ? subs.add(check).size == 1 : subs.delete(check) && !subs.size) {
    // the same calls both ways; the channel cannot be re-attached, so it is replaced
    const method = on ? 'addEventListener' : 'removeEventListener';
    globalThis.cookieStore?.[method]('change', changed);
    document[method]('visibilitychange', shown);
    channel?.close();
    channel = on ? open() : undefined;
    if (channel) channel.onmessage = changed;
  }
};

/** Tell other tabs a pref changed, when they cannot learn it from CookieStore. */
export const post = () => {
  const channel = open();
  channel?.postMessage(0);
  channel?.close();
};
